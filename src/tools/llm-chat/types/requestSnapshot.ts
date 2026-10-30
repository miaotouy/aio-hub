import type { TokenUsage } from "@aiohub/llm-core";

export interface ExecutedMacroSummary {
  name: string;
  occurrence: number;
  argsHash?: string;
  outputLength: number;
  outputHash: string;
  preview?: string;
}
export interface SnapshotSource {
  originalRole?: string;
  sourceKey: string;
  occurrence: number;
  sourceType?: string;
  sourceId?: string | number;
  sourceName?: string;
  presetContributions?: Array<{ partId: string; optionId?: string }>;
  parentSourceKeys?: string[];
  contentHash: string;
  charLength: number;
  executedMacros?: ExecutedMacroSummary[];
}
export interface SnapshotContentPart {
  kind: string;
  contentHash: string;
  charLength?: number;
  textPreview?: string;
  textState?: "omitted" | "full" | "truncated" | "redacted";
  sourceKeys: string[];
}
export interface SnapshotMessageItem {
  role: string;
  wireHash: string;
  parts: SnapshotContentPart[];
  sourceKeys: string[];
}
export interface SnapshotRoute {
  logicalProfileId: string;
  logicalModelId: string;
  actualProfileId: string;
  actualModelId: string;
  providerType: string;
  adapterId?: string;
  cacheScopeFingerprint?: string;
}
export interface SnapshotTransformation {
  name: string;
  beforeHash: string;
  afterHash: string;
  removedSourceIds: string[];
}
export interface ChatRequestAttemptSnapshot {
  attemptId: string;
  requestId: string;
  attemptIndex: number;
  sessionId: string;
  assistantNodeIds: string[];
  triggerNodeId?: string;
  startedAt: number;
  endedAt?: number;
  status: "completed" | "error" | "aborted";
  route: SnapshotRoute;
  captureQuality: "complete" | "partial" | "summaryOnly";
  inputHash: string;
  promptOptionsHash?: string;
  topLevelSystem?: Omit<SnapshotMessageItem, "role">;
  messages: SnapshotMessageItem[];
  nativeToolsDigest?: { count: number; schemaHash: string };
  sources: SnapshotSource[];
  transformations?: SnapshotTransformation[];
  providerUsageStatus: "missing" | "partial" | "reported";
  reportedUsageFields?: Record<string, number>;
  providerUsage?: TokenUsage;
  estimatedUsage?: TokenUsage;
  processingScope?: "server";
}
export interface SessionRequestSnapshotFile {
  schemaVersion: 1;
  sessionId: string;
  updatedAt: number;
  attempts: ChatRequestAttemptSnapshot[];
  _persistence?: { revision: number };
}
