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
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean).length;
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
      throw new Error(`Pipeline compile failed: ${JSON.stringify(compiled.issues)}`);
    }
    if (compiled.externalRequirements.length !== 0) {
      throw new Error("Algorithmic compile unexpectedly requested an external artifact.");
    }

    const filters = {
      recallIds: [recallRuntimeFixture.manifest.recall.id],
      tags: null,
      limit: 3,
      minScore: null,
      enabledOnly: true,
      texture: null,
      refractionIndex: null,
      requiredTags: null,
      historyVectors: null,
      k1: null,
      b: null,
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
    if (stale.outcome !== "failed" || stale.error?.code !== "config-hash-mismatch") {
      throw new Error("Pipeline did not reject a stale config hash before execution.");
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
      throw new Error("Pipeline run metadata does not match the compiled request.");
    }
    if (trace.steps.some((step) => step.status !== "completed")) {
      throw new Error("Algorithmic pipeline contains a non-completed trace step.");
    }
    if (lineCount(embeddingLog) !== embeddingBaseline) {
      throw new Error("Algorithmic pipeline sent an unexpected Embedding request.");
    }

    const comprehensiveRunId = `recall-comprehensive-${Date.now()}`;
    const comprehensive = await invokeTauriCommand<CompileResult>(
      "recall_compile_retrieval_pipeline",
      { presetId: "comprehensive", runId: comprehensiveRunId, limit: 3 }
    );
    if (!comprehensive.valid || comprehensive.externalRequirements.length !== 1) {
      throw new Error("Comprehensive pipeline did not compile with one shared external requirement.");
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
    if (comprehensiveResponse.outcome !== "success" || !comprehensiveResponse.trace) {
      throw new Error(`Comprehensive pipeline returned ${comprehensiveResponse.outcome}.`);
    }
    const comprehensiveTrace = comprehensiveResponse.trace;
    const modules = new Set(comprehensiveTrace.steps.map((step) => step.moduleId));
    for (const moduleId of [
      "keyword-recall",
      "content-vector-recall",
      "tag-vector-recall",
      "lens-association-recall",
    ]) {
      if (!modules.has(moduleId)) {
        throw new Error(`Comprehensive trace is missing ${moduleId}.`);
      }
    }
    if (
      comprehensiveTrace.bundleId !== bundleId ||
      comprehensiveTrace.externalRequirements.join(",") !== "query-embedding"
    ) {
      throw new Error("Comprehensive trace did not preserve the shared bundle identity.");
    }
    if (lineCount(embeddingLog) !== embeddingBaseline) {
      throw new Error("Prepared comprehensive pipeline sent a duplicate Embedding request.");
    }

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
            resultIds: comprehensiveResponse.results.map((result) => result.entry.id),
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });
});
