import type { TokenUsage } from "../types/response";

export type ProbeKind = "model-list" | "inference" | "key" | "batch-model";

export type ProbeCapability =
  "chat" | "embedding" | "rerank" | "image" | "audio" | "video" | "music";

export type ProbePhase =
  | "prepare"
  | "build-request"
  | "transport"
  | "response-status"
  | "decode"
  | "semantic-validation";

export type ProbeErrorCategory =
  | "authentication"
  | "authorization"
  | "rate-limit"
  | "bad-request"
  | "model-unavailable"
  | "unsupported-capability"
  | "configuration"
  | "network"
  | "timeout"
  | "provider"
  | "cancelled"
  | "unknown";

export interface ProbeModelCapabilities {
  embedding?: boolean;
  rerank?: boolean;
  imageGeneration?: boolean;
  audioGeneration?: boolean;
  videoGeneration?: boolean;
  musicGeneration?: boolean;
}

export interface ProbeModelDescriptor {
  id: string;
  capabilities?: ProbeModelCapabilities;
}

export interface ProbePlan {
  capability: ProbeCapability;
  stream: boolean;
  requiresExplicitConsent: boolean;
  supported: boolean;
  chat?: { prompt: string; maxTokens: number };
  embedding?: { input: string };
  rerank?: { query: string; documents: string[] };
  media?: { prompt: string };
}

export interface ProbeValidationInput {
  capability: ProbeCapability;
  stream?: boolean;
  streamDeltaReceived?: boolean;
  response?: {
    content?: string;
    toolCalls?: unknown[];
    images?: Array<{ url?: string; b64_json?: string | ArrayBuffer }>;
    audios?: Array<{ url?: string; b64_json?: string | ArrayBuffer }>;
    audio?: { data?: string | ArrayBuffer };
    audioData?: string | ArrayBuffer;
  };
  embedding?: { data?: Array<{ embedding?: number[] }> };
  rerank?: { results?: Array<{ index?: number; relevanceScore?: number }> };
  rerankDocumentCount?: number;
}

export interface ProbeValidationResult {
  valid: boolean;
  preview?: string;
  errorMessage?: string;
}

export interface ChannelProbeResult {
  success: boolean;
  kind: ProbeKind;
  capability?: ProbeCapability;
  modelId?: string;
  phase: ProbePhase;
  category?: ProbeErrorCategory;
  status?: number;
  totalMs: number;
  firstByteMs?: number;
  responsePreview?: string;
  usage?: TokenUsage;
  errorMessage?: string;
  errorDetail?: string;
  testedAt: number;
}
