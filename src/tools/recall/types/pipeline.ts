// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { RecallResult, RecallSignalType } from "./search";

export const RECALL_PIPELINE_SCHEMA_VERSION = 1 as const;
export const RECALL_PIPELINE_TRACE_VERSION =
  "recall-pipeline-trace-v1" as const;
export const RECALL_PIPELINE_CONTRACT_VERSION =
  "recall-retrieval-pipeline-v1" as const;

export type RecallPresetId = "algorithmic" | "comprehensive";

export type RecallRetrievalPhase =
  | "prepare"
  | "retrieve"
  | "normalize"
  | "fuse"
  | "rerank"
  | "filter"
  | "finalize";

export type RecallArtifactKey =
  | "normalized-query"
  | "query-tokens"
  | "matched-tags"
  | "query-embedding"
  | "query-energy-field"
  | "candidate-signals"
  | "normalized-signals"
  | "fused-candidates"
  | "ranked-candidates"
  | "final-results";

export type RecallExternalRequirementKind =
  | "query-embedding"
  | "embedding-space"
  | "entry-vectors"
  | "tag-pool"
  | "index-snapshot";

export type RecallPipelineErrorCode =
  | "schema-version-unsupported"
  | "preset-not-found"
  | "module-not-found"
  | "parameter-invalid"
  | "phase-invalid"
  | "dependency-cycle"
  | "artifact-missing"
  | "artifact-provider-ambiguous"
  | "finalizer-missing"
  | "finalizer-duplicate"
  | "external-requirement-missing"
  | "external-artifact-invalid"
  | "config-hash-mismatch"
  | "run-stale"
  | "run-cancelled"
  | "module-execution-failed"
  | "fallback-not-allowed"
  | "legacy-id-unknown";

export interface RecallCandidateSignal {
  recallId: string;
  entryId: string;
  signalType: RecallSignalType;
  rawScore: number;
  normalizedScore?: number;
  sourceModuleId: string;
  details: Record<string, unknown>;
}

export interface RecallPipelineCandidate {
  recallId: string;
  entryId: string;
  relevanceScore: number;
  score: number;
  details: Record<string, unknown>;
}

export interface RecallRetrievalArtifactBundle {
  bundleId: string;
  embeddingSpace?: string;
  modelSignature?: string;
  assetGeneration?: string;
  algorithmVersion: string;
  queryEmbedding?: number[];
  queryEnergyField?: Record<string, unknown>;
}

export interface RecallRetrievalModuleInfo {
  id: string;
  version: string;
  phase: RecallRetrievalPhase;
  requires: RecallArtifactKey[];
  provides: RecallArtifactKey[];
  externalRequirements: RecallExternalRequirementKind[];
  parameterSchema: Record<string, unknown>;
}

export interface RecallRetrievalPipelineNodeV1 {
  id: string;
  moduleId: string;
  enabled: boolean;
  dependsOn?: string[];
  params: Record<string, unknown>;
  failurePolicy?: "abort" | "skip";
}

export interface RecallRetrievalPipelineV1 {
  schemaVersion: typeof RECALL_PIPELINE_SCHEMA_VERSION;
  id: string;
  displayName: string;
  algorithmVersion: string;
  candidateBudget: number;
  expansionBudget: number;
  nodes: RecallRetrievalPipelineNodeV1[];
}

export interface RecallPresetSummary {
  id: RecallPresetId;
  displayName: string;
  description: string;
  visibility: "product" | "playground";
  stability: "stable" | "experimental";
  algorithmVersion: string;
  allowedOverrides: Array<{
    key: string;
    schema: Record<string, unknown>;
  }>;
}

export interface RecallPipelineExternalRequirement {
  kind: RecallExternalRequirementKind;
  status: "ready" | "missing" | "partial";
  blocking: boolean;
  details?: Record<string, unknown>;
}

export interface RecallPipelineIssue {
  severity: "error" | "warning";
  nodeId?: string;
  fieldPath?: string;
  code: RecallPipelineErrorCode;
  message: string;
}

export interface RecallPipelineCompileResult {
  runId: string;
  valid: boolean;
  pipelineId: string;
  configHash: string;
  algorithmVersion: string;
  candidateBudget: number;
  expansionBudget: number;
  externalRequirements: RecallPipelineExternalRequirement[];
  issues: RecallPipelineIssue[];
  stages: Array<{
    phase: RecallRetrievalPhase;
    nodeIds: string[];
  }>;
  moduleVersions: Record<string, string>;
}

export interface RecallPipelineTraceStepV1 {
  nodeId: string;
  moduleId: string;
  phase: RecallRetrievalPhase;
  durationMs: number;
  inputCount?: number;
  outputCount?: number;
  status: "completed" | "skipped" | "failed";
  reason?: string;
  candidateTrimmed?: number;
  trimReason?: string;
  details?: Record<string, unknown>;
}

export interface RecallPipelineTraceV1 {
  traceVersion: typeof RECALL_PIPELINE_TRACE_VERSION;
  runId: string;
  pipelineId: string;
  requestedPresetId?: RecallPresetId;
  actualPresetId?: RecallPresetId;
  fallbackReason?: string;
  algorithmVersion: string;
  configHash: string;
  bundleId?: string;
  candidateBudget: number;
  expansionBudget: number;
  finalLimit: number;
  externalRequirements: RecallExternalRequirementKind[];
  steps: RecallPipelineTraceStepV1[];
}

export interface RecallPipelineRunError {
  code: RecallPipelineErrorCode;
  message: string;
  nodeId?: string;
  fieldPath?: string;
}

export interface RecallPipelineRunResponse {
  runId: string;
  outcome: "success" | "empty" | "fallback" | "failed" | "cancelled";
  requestedPresetId: RecallPresetId;
  actualPresetId: RecallPresetId;
  configHash: string;
  results: RecallResult[];
  trace?: RecallPipelineTraceV1;
  error?: RecallPipelineRunError;
}

export type RecallPipelineUiState =
  | "idle"
  | "compiling"
  | "blocked"
  | "ready"
  | "preparing"
  | "running"
  | "success"
  | "empty"
  | "fallback"
  | "failed"
  | "cancelled";

export const RECALL_PIPELINE_UI_TRANSITIONS: Readonly<
  Record<RecallPipelineUiState, readonly RecallPipelineUiState[]>
> = {
  idle: ["compiling"],
  compiling: ["blocked", "ready", "failed"],
  blocked: ["idle", "compiling"],
  ready: ["idle", "compiling", "preparing"],
  preparing: ["compiling", "running", "failed", "cancelled"],
  running: ["compiling", "success", "empty", "fallback", "failed", "cancelled"],
  success: ["idle", "compiling"],
  empty: ["idle", "compiling"],
  fallback: ["idle", "compiling"],
  failed: ["idle", "compiling"],
  cancelled: ["idle", "compiling"],
};

export function canTransitionRecallPipelineUiState(
  from: RecallPipelineUiState,
  to: RecallPipelineUiState
): boolean {
  return RECALL_PIPELINE_UI_TRANSITIONS[from].includes(to);
}

export interface RecallPipelineRequestIdentity {
  runId: string;
  configHash: string;
}

export function isCurrentRecallPipelineResponse(
  active: RecallPipelineRequestIdentity | null,
  response: RecallPipelineRequestIdentity
): boolean {
  return (
    active !== null &&
    active.runId === response.runId &&
    active.configHash === response.configHash
  );
}
