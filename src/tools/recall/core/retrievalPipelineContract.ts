// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import {
  RECALL_PIPELINE_CONTRACT_VERSION,
  RECALL_PIPELINE_SCHEMA_VERSION,
  RECALL_PIPELINE_TRACE_VERSION,
  type RecallPipelineCompileResult,
  type RecallPipelineRunResponse,
  type RecallPresetSummary,
  type RecallRetrievalPipelineV1,
} from "../types/pipeline";

export const RECALL_PIPELINE_ALGORITHM_VERSIONS = {
  algorithmic: "recall-pipeline-algorithmic-v2",
  comprehensive: "recall-pipeline-comprehensive-v3",
} as const;

const LIMIT_OVERRIDE = {
  key: "limit",
  schema: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 6,
    scope: "finalize",
  },
} as const;

export const RECALL_BUILTIN_PRESETS: readonly RecallPresetSummary[] = [
  {
    id: "algorithmic",
    displayName: "算法召回",
    description: "离线可用的关键词与字面信号召回",
    visibility: "product",
    stability: "stable",
    algorithmVersion: RECALL_PIPELINE_ALGORITHM_VERSIONS.algorithmic,
    allowedOverrides: [LIMIT_OVERRIDE],
  },
  {
    id: "comprehensive",
    displayName: "综合召回",
    description: "融合字面、内容向量和标签图信号的召回",
    visibility: "product",
    stability: "stable",
    algorithmVersion: RECALL_PIPELINE_ALGORITHM_VERSIONS.comprehensive,
    allowedOverrides: [LIMIT_OVERRIDE],
  },
] as const;

export interface RecallPipelineContractFixture {
  contractVersion: string;
  presetSummaries: RecallPresetSummary[];
  pipeline: RecallRetrievalPipelineV1;
  compileResult: RecallPipelineCompileResult;
  runResponse: RecallPipelineRunResponse;
  uiTransitions: Array<{ from: string; to: string[] }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  path: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
}

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
}

function assertOneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${path} has an unsupported value`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string
): void {
  for (const key of required) {
    if (!(key in value)) throw new Error(`${path}.${key} is required`);
  }
  const allowed = new Set([...required, ...optional]);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${path}.${unexpected} is not allowed`);
}

/** Validates the runtime JSON shape shared with the Rust contract tests. */
export function assertRecallPipelineContractFixture(
  value: unknown
): asserts value is RecallPipelineContractFixture {
  assertRecord(value, "fixture");
  if (value.contractVersion !== RECALL_PIPELINE_CONTRACT_VERSION) {
    throw new Error("fixture.contractVersion is unsupported");
  }
  assertArray(value.presetSummaries, "fixture.presetSummaries");
  for (const [index, preset] of value.presetSummaries.entries()) {
    const path = `fixture.presetSummaries[${index}]`;
    assertRecord(preset, path);
    assertExactKeys(
      preset,
      [
        "id",
        "displayName",
        "description",
        "visibility",
        "stability",
        "algorithmVersion",
        "allowedOverrides",
      ],
      [],
      path
    );
    for (const field of ["displayName", "description", "algorithmVersion"]) {
      assertString(preset[field], `${path}.${field}`);
    }
    assertOneOf(preset.id, ["algorithmic", "comprehensive"], `${path}.id`);
    assertOneOf(
      preset.visibility,
      ["product", "playground"],
      `${path}.visibility`
    );
    assertOneOf(
      preset.stability,
      ["stable", "experimental"],
      `${path}.stability`
    );
    assertArray(preset.allowedOverrides, `${path}.allowedOverrides`);
  }

  assertRecord(value.pipeline, "fixture.pipeline");
  assertExactKeys(
    value.pipeline,
    [
      "schemaVersion",
      "id",
      "displayName",
      "algorithmVersion",
      "candidateBudget",
      "expansionBudget",
      "nodes",
    ],
    [],
    "fixture.pipeline"
  );
  if (value.pipeline.schemaVersion !== RECALL_PIPELINE_SCHEMA_VERSION) {
    throw new Error("fixture.pipeline.schemaVersion is unsupported");
  }
  for (const field of ["id", "displayName", "algorithmVersion"]) {
    assertString(value.pipeline[field], `fixture.pipeline.${field}`);
  }
  for (const field of ["candidateBudget", "expansionBudget"]) {
    assertNumber(value.pipeline[field], `fixture.pipeline.${field}`);
  }
  assertArray(value.pipeline.nodes, "fixture.pipeline.nodes");
  for (const [index, node] of value.pipeline.nodes.entries()) {
    const path = `fixture.pipeline.nodes[${index}]`;
    assertRecord(node, path);
    assertExactKeys(
      node,
      ["id", "moduleId", "enabled", "params"],
      ["dependsOn", "failurePolicy"],
      path
    );
    for (const field of ["id", "moduleId"]) {
      assertString(node[field], `${path}.${field}`);
    }
    if (typeof node.enabled !== "boolean") {
      throw new Error(`${path}.enabled must be a boolean`);
    }
    assertRecord(node.params, `${path}.params`);
    if (node.dependsOn !== undefined)
      assertArray(node.dependsOn, `${path}.dependsOn`);
    if (node.failurePolicy !== undefined) {
      assertOneOf(
        node.failurePolicy,
        ["abort", "skip"],
        `${path}.failurePolicy`
      );
    }
  }

  assertRecord(value.compileResult, "fixture.compileResult");
  assertExactKeys(
    value.compileResult,
    [
      "runId",
      "valid",
      "pipelineId",
      "configHash",
      "algorithmVersion",
      "candidateBudget",
      "expansionBudget",
      "externalRequirements",
      "issues",
      "stages",
      "moduleVersions",
    ],
    [],
    "fixture.compileResult"
  );
  for (const field of [
    "runId",
    "pipelineId",
    "configHash",
    "algorithmVersion",
  ]) {
    assertString(value.compileResult[field], `fixture.compileResult.${field}`);
  }
  if (typeof value.compileResult.valid !== "boolean") {
    throw new Error("fixture.compileResult.valid must be a boolean");
  }
  for (const field of ["candidateBudget", "expansionBudget"]) {
    assertNumber(value.compileResult[field], `fixture.compileResult.${field}`);
  }
  for (const field of ["externalRequirements", "issues"]) {
    assertArray(value.compileResult[field], `fixture.compileResult.${field}`);
  }
  const stages = value.compileResult.stages;
  assertArray(stages, "fixture.compileResult.stages");
  for (const [index, stage] of stages.entries()) {
    const path = `fixture.compileResult.stages[${index}]`;
    assertRecord(stage, path);
    assertExactKeys(stage, ["phase", "nodeIds"], [], path);
    assertOneOf(
      stage.phase,
      [
        "prepare",
        "retrieve",
        "normalize",
        "fuse",
        "rerank",
        "filter",
        "finalize",
      ],
      `${path}.phase`
    );
    assertArray(stage.nodeIds, `${path}.nodeIds`);
  }
  assertRecord(
    value.compileResult.moduleVersions,
    "fixture.compileResult.moduleVersions"
  );

  assertRecord(value.runResponse, "fixture.runResponse");
  assertExactKeys(
    value.runResponse,
    [
      "runId",
      "outcome",
      "requestedPresetId",
      "actualPresetId",
      "configHash",
      "results",
    ],
    ["trace", "error"],
    "fixture.runResponse"
  );
  for (const field of ["runId", "configHash"]) {
    assertString(value.runResponse[field], `fixture.runResponse.${field}`);
  }
  assertOneOf(
    value.runResponse.outcome,
    ["success", "empty", "fallback", "failed", "cancelled"],
    "fixture.runResponse.outcome"
  );
  assertOneOf(
    value.runResponse.requestedPresetId,
    ["algorithmic", "comprehensive", "custom"],
    "fixture.runResponse.requestedPresetId"
  );
  assertOneOf(
    value.runResponse.actualPresetId,
    ["algorithmic", "comprehensive", "custom"],
    "fixture.runResponse.actualPresetId"
  );
  assertArray(value.runResponse.results, "fixture.runResponse.results");
  assertRecord(value.runResponse.trace, "fixture.runResponse.trace");
  assertExactKeys(
    value.runResponse.trace,
    [
      "traceVersion",
      "runId",
      "pipelineId",
      "algorithmVersion",
      "configHash",
      "candidateBudget",
      "expansionBudget",
      "finalLimit",
      "externalRequirements",
      "steps",
    ],
    ["requestedPresetId", "actualPresetId", "fallbackReason", "bundleId"],
    "fixture.runResponse.trace"
  );
  if (value.runResponse.trace.traceVersion !== RECALL_PIPELINE_TRACE_VERSION) {
    throw new Error("fixture.runResponse.trace.traceVersion is unsupported");
  }
  for (const field of [
    "runId",
    "pipelineId",
    "algorithmVersion",
    "configHash",
  ]) {
    assertString(
      value.runResponse.trace[field],
      `fixture.runResponse.trace.${field}`
    );
  }
  for (const field of ["candidateBudget", "expansionBudget", "finalLimit"]) {
    assertNumber(
      value.runResponse.trace[field],
      `fixture.runResponse.trace.${field}`
    );
  }
  assertArray(
    value.runResponse.trace.externalRequirements,
    "fixture.runResponse.trace.externalRequirements"
  );
  assertArray(value.runResponse.trace.steps, "fixture.runResponse.trace.steps");
  for (const [index, step] of value.runResponse.trace.steps.entries()) {
    const path = `fixture.runResponse.trace.steps[${index}]`;
    assertRecord(step, path);
    assertExactKeys(
      step,
      ["nodeId", "moduleId", "phase", "durationMs", "status"],
      [
        "inputCount",
        "outputCount",
        "reason",
        "candidateTrimmed",
        "trimReason",
        "details",
      ],
      path
    );
    assertString(step.nodeId, `${path}.nodeId`);
    assertString(step.moduleId, `${path}.moduleId`);
    assertOneOf(
      step.phase,
      [
        "prepare",
        "retrieve",
        "normalize",
        "fuse",
        "rerank",
        "filter",
        "finalize",
      ],
      `${path}.phase`
    );
    assertNumber(step.durationMs, `${path}.durationMs`);
    assertOneOf(
      step.status,
      ["completed", "skipped", "failed"],
      `${path}.status`
    );
    if (step.details !== undefined)
      assertRecord(step.details, `${path}.details`);
  }
  assertArray(value.uiTransitions, "fixture.uiTransitions");
}
