import type {
  ChannelProbeResult,
  ProbeCapability,
  ProbeKind,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";

export type {
  ChannelProbeResult,
  ProbeCapability,
  ProbeErrorCategory,
  ProbeKind,
  ProbePhase,
} from "@aiohub/llm-core";

export interface ChannelProbeRequest {
  kind: ProbeKind;
  profile: LlmProfile;
  modelId?: string;
  apiKey?: string;
  capability?: ProbeCapability;
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  allowCostlyMedia?: boolean;
}

export interface BatchProbeRequest {
  profile: LlmProfile;
  modelIds: string[];
  concurrency?: number;
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
