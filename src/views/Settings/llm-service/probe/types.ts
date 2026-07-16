import type {
  ChannelProbeResult as CoreChannelProbeResult,
  ProbeCapability,
  ProbeKind,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";

export type {
  ProbeCapability,
  ProbeErrorCategory,
  ProbeKind,
  ProbePhase,
} from "@aiohub/llm-core";

export type ProbeEndpointType =
  | "auto"
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini-generate-content"
  | "embeddings"
  | "jina-rerank"
  | "image-generation";

export interface ChannelProbeResult extends CoreChannelProbeResult {
  endpointType: ProbeEndpointType;
}

export interface BatchProbeProgress {
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface ChannelProbeRequest {
  kind: ProbeKind;
  profile: LlmProfile;
  modelId?: string;
  apiKey?: string;
  capability?: ProbeCapability;
  endpointType?: ProbeEndpointType;
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  allowCostlyMedia?: boolean;
}

export interface BatchProbeRequest {
  profile: LlmProfile;
  modelIds: string[];
  concurrency?: number;
  endpointType?: ProbeEndpointType;
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  allowCostlyMedia?: boolean;
  onResult?: (
    result: ChannelProbeResult,
    completed: number,
    total: number
  ) => void;
}
