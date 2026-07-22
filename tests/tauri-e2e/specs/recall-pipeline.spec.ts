import fs from "node:fs";
import path from "node:path";
import {
  recallRuntimeFixture,
  requiredE2eEnv,
  setupRecallRuntimeFixture,
} from "../support/recall-runtime-fixture";
import { invokeTauriCommand } from "../support/tauri-command";

interface CompileResult {
  runId: string;
  valid: boolean;
  pipelineId: string;
  configHash: string;
  algorithmVersion: string;
  externalRequirements: unknown[];
  issues: unknown[];
  stages: Array<{ phase: string; nodeIds: string[] }>;
  moduleVersions: Record<string, string>;
}

interface RunResponse {
  runId: string;
  outcome: "success" | "empty" | "fallback" | "failed" | "cancelled";
  requestedPresetId: string;
  actualPresetId: string;
  configHash: string;
  results: Array<{ entry: { id: string }; score: number }>;
  trace?: {
    traceVersion: string;
    pipelineId: string;
    algorithmVersion: string;
    requestedPresetId?: string;
    actualPresetId?: string;
    bundleId?: string;
    configHash: string;
    externalRequirements: string[];
    steps: Array<{ moduleId: string; status: string }>;
  };
  error?: { code: string; message: string };
}

function lineCount(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)
    .length;
}

describe("Recall retrieval pipeline", () => {
  before(async () => {
    await setupRecallRuntimeFixture();
  });

  it("compiles and runs algorithmic through production IPC without Embedding", async () => {
    const artifactDir = requiredE2eEnv("AIO_E2E_ARTIFACT_DIR");
    const embeddingLog = path.join(artifactDir, "embedding-requests.jsonl");
    const embeddingBaseline = lineCount(embeddingLog);
    const runId = `recall-pipeline-${Date.now()}`;

    const presets = await invokeTauriCommand<
      Array<{ id: string; algorithmVersion: string }>
    >("recall_list_retrieval_presets");
    if (!presets.some((preset) => preset.id === "algorithmic")) {
      throw new Error("Algorithmic retrieval preset is not registered.");
    }

    const compiled = await invokeTauriCommand<CompileResult>(
      "recall_compile_retrieval_pipeline",
      { presetId: "algorithmic", runId, limit: 3 }
    );
    if (!compiled.valid || compiled.issues.length > 0) {
      throw new Error(
        `Pipeline compile failed: ${JSON.stringify(compiled.issues)}`
      );
    }
    if (compiled.externalRequirements.length !== 0) {
      throw new Error(
        "Algorithmic compile unexpectedly requested an external artifact."
      );
    }

    const filters = {
      recallIds: [recallRuntimeFixture.manifest.recall.id],
      tags: null,
      limit: 3,
      minScore: null,
      enabledOnly: true,
    };
    const stale = await invokeTauriCommand<RunResponse>(
      "recall_run_retrieval_pipeline",
      {
        request: {
          query: "Rust ownership",
          filters,
          presetId: "algorithmic",
          runId,
          configHash: "stale-config-hash",
        },
      }
    );
    if (
      stale.outcome !== "failed" ||
      stale.error?.code !== "config-hash-mismatch"
    ) {
      throw new Error(
        "Pipeline did not reject a stale config hash before execution."
      );
    }

    const response = await invokeTauriCommand<RunResponse>(
      "recall_run_retrieval_pipeline",
      {
        request: {
          query: "Rust ownership",
          filters,
          presetId: "algorithmic",
          runId,
          configHash: compiled.configHash,
        },
      }
    );
    if (response.outcome !== "success" || response.results.length === 0) {
      throw new Error(`Algorithmic pipeline returned ${response.outcome}.`);
    }
    const trace = response.trace;
    if (!trace || trace.traceVersion !== "recall-pipeline-trace-v1") {
      throw new Error("Pipeline trace version is missing or invalid.");
    }
    if (
      trace.pipelineId !== "algorithmic" ||
      trace.algorithmVersion !== compiled.algorithmVersion ||
      trace.configHash !== compiled.configHash ||
      trace.requestedPresetId !== "algorithmic" ||
      trace.actualPresetId !== "algorithmic" ||
      trace.externalRequirements.length !== 0
    ) {
      throw new Error(
        "Pipeline run metadata does not match the compiled request."
      );
    }
    if (trace.steps.some((step) => step.status !== "completed")) {
      throw new Error(
        "Algorithmic pipeline contains a non-completed trace step."
      );
    }
    if (lineCount(embeddingLog) !== embeddingBaseline) {
      throw new Error(
        "Algorithmic pipeline sent an unexpected Embedding request."
      );
    }

    const comprehensiveRunId = `recall-comprehensive-${Date.now()}`;
    const comprehensive = await invokeTauriCommand<CompileResult>(
      "recall_compile_retrieval_pipeline",
      { presetId: "comprehensive", runId: comprehensiveRunId, limit: 3 }
    );
    if (
      !comprehensive.valid ||
      comprehensive.externalRequirements.length !== 1
    ) {
      throw new Error(
        "Comprehensive pipeline did not compile with one shared external requirement."
      );
    }
    const bundleId = `bundle-${comprehensiveRunId}`;
    const comprehensiveResponse = await invokeTauriCommand<RunResponse>(
      "recall_run_retrieval_pipeline",
      {
        request: {
          query: "Rust ownership",
          filters,
          presetId: "comprehensive",
          runId: comprehensiveRunId,
          configHash: comprehensive.configHash,
          bundle: {
            bundleId,
            embeddingSpace: `e2e:${recallRuntimeFixture.embeddingModelId}`,
            modelSignature: recallRuntimeFixture.embeddingModelId,
            assetGeneration: "e2e-fixture-v1",
            algorithmVersion: comprehensive.algorithmVersion,
            queryEmbedding: Array.from(
              { length: recallRuntimeFixture.embeddingDimension },
              (_, index) => (index === 0 ? 1 : 0)
            ),
          },
        },
      }
    );
    if (
      comprehensiveResponse.outcome !== "success" ||
      !comprehensiveResponse.trace
    ) {
      throw new Error(
        `Comprehensive pipeline returned ${comprehensiveResponse.outcome}.`
      );
    }
    const comprehensiveTrace = comprehensiveResponse.trace;
    const modules = new Set(
      comprehensiveTrace.steps.map((step) => step.moduleId)
    );
    for (const moduleId of [
      "keyword-recall",
      "content-vector-recall",
      "tag-vector-recall",
      "bounded-tag-propagation",
      "tag-to-entry-expansion",
    ]) {
      if (!modules.has(moduleId)) {
        throw new Error(`Comprehensive trace is missing ${moduleId}.`);
      }
    }
    if (
      comprehensiveTrace.bundleId !== bundleId ||
      comprehensiveTrace.externalRequirements.join(",") !== "query-embedding"
    ) {
      throw new Error(
        "Comprehensive trace did not preserve the shared bundle identity."
      );
    }
    if (lineCount(embeddingLog) !== embeddingBaseline) {
      throw new Error(
        "Prepared comprehensive pipeline sent a duplicate Embedding request."
      );
    }

    const moduleRegistry = await invokeTauriCommand<
      Array<{ id: string; phase: string }>
    >("recall_list_retrieval_modules");
    if (
      !moduleRegistry.some((module) => module.id === "query-normalize") ||
      !moduleRegistry.some((module) => module.id === "result-finalizer")
    ) {
      throw new Error("Custom pipeline module registry is incomplete.");
    }
    const template = await invokeTauriCommand<{
      schemaVersion: number;
      nodes: unknown[];
      id: string;
    }>("recall_get_retrieval_pipeline_template", {
      presetId: "algorithmic",
      limit: 3,
    });
    const customRunId = `recall-custom-${Date.now()}`;
    const customCompile = await invokeTauriCommand<CompileResult>(
      "recall_compile_custom_retrieval_pipeline",
      { pipeline: template, runId: customRunId }
    );
    if (
      !customCompile.valid ||
      customCompile.pipelineId !== "playground-custom" ||
      customCompile.algorithmVersion !== "recall-playground-custom-v1"
    ) {
      throw new Error(
        "Custom pipeline compile did not use the server-owned identity."
      );
    }
    const customResponse = await invokeTauriCommand<RunResponse>(
      "recall_run_custom_retrieval_pipeline",
      {
        request: {
          query: "Rust ownership",
          filters,
          pipeline: template,
          runId: customRunId,
          configHash: customCompile.configHash,
        },
      }
    );
    if (
      !["success", "empty"].includes(customResponse.outcome) ||
      customResponse.requestedPresetId !== "custom" ||
      customResponse.actualPresetId !== "custom" ||
      customResponse.trace?.pipelineId !== "playground-custom"
    ) {
      throw new Error("Custom pipeline run metadata is invalid.");
    }

    await browser.execute(() => {
      window.history.pushState({}, "", "/recall");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await $('[data-testid="recall-workspace"]').waitForDisplayed({
      timeout: 30_000,
    });
    await $('[data-testid="recall-tab-playground"]').click();
    await $('[data-testid="recall-playground"]').waitForDisplayed({
      timeout: 10_000,
    });
    const openEditor = await $$('[data-testid="recall-pipeline-editor-open"]');
    if (!openEditor.length)
      throw new Error("Pipeline editor action is missing.");
    await openEditor[0].waitForEnabled({ timeout: 10_000 });
    await openEditor[0].click();
    await $('[data-testid="recall-pipeline-editor"]').waitForDisplayed({
      timeout: 10_000,
    });
    if ((await $$('[data-testid="recall-pipeline-custom-mode"]')).length) {
      throw new Error(
        "Opening the editor applied custom mode before confirmation."
      );
    }
    await $('[data-testid="recall-pipeline-editor-cancel"]').click();
    await $('[data-testid="recall-pipeline-editor"]').waitForDisplayed({
      reverse: true,
      timeout: 5_000,
    });

    await openEditor[0].click();
    const applyEditor = await $('[data-testid="recall-pipeline-editor-apply"]');
    await applyEditor.waitForEnabled({ timeout: 10_000 });
    await applyEditor.click();
    await $('[data-testid="recall-pipeline-custom-mode"]').waitForDisplayed({
      timeout: 5_000,
    });

    fs.writeFileSync(
      path.join(artifactDir, "recall-pipeline-run.json"),
      `${JSON.stringify(
        {
          executionPath: "retrieval-pipeline",
          runId: response.runId,
          configHash: response.configHash,
          algorithmVersion: trace.algorithmVersion,
          requestedPresetId: response.requestedPresetId,
          actualPresetId: response.actualPresetId,
          traceVersion: trace.traceVersion,
          resultIds: response.results.map((result) => result.entry.id),
          stageCount: compiled.stages.length,
          moduleVersions: compiled.moduleVersions,
          embeddingRequests: 0,
          comprehensive: {
            configHash: comprehensive.configHash,
            algorithmVersion: comprehensive.algorithmVersion,
            bundleId,
            resultIds: comprehensiveResponse.results.map(
              (result) => result.entry.id
            ),
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });
});
