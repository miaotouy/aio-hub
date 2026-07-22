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
        query: "Rust ownership",
        filters,
        presetId: "algorithmic",
        runId,
        configHash: "stale-config-hash",
      }
    );
    if (stale.outcome !== "failed" || stale.error?.code !== "config-hash-mismatch") {
      throw new Error("Pipeline did not reject a stale config hash before execution.");
    }

    const response = await invokeTauriCommand<RunResponse>(
      "recall_run_retrieval_pipeline",
      {
        query: "Rust ownership",
        filters,
        presetId: "algorithmic",
        runId,
        configHash: compiled.configHash,
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
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });
});
