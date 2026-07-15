import type { JsonValue } from "./json";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptTokensDetails?: {
    cachedTokens?: number;
    audioTokens?: number;
  };
  completionTokensDetails?: {
    reasoningTokens?: number;
    audioTokens?: number;
    acceptedPredictionTokens?: number;
    rejectedPredictionTokens?: number;
  };
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmAnnotation {
  type: string;
  [key: string]: JsonValue;
}

export type MediaAssetRef =
  | {
      kind: "remote-url";
      url: string;
      contentType?: string;
      revisedPrompt?: string;
    }
  | {
      kind: "inline-base64";
      data: string;
      contentType: string;
      revisedPrompt?: string;
    }
  | {
      kind: "local-asset";
      id: string;
      contentType?: string;
      revisedPrompt?: string;
    };

export type LlmFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_calls"
  | "function_call"
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | string
  | null;

export interface LlmResponse {
  content: string;
  reasoningContent?: string;
  refusal?: string | null;
  finishReason?: LlmFinishReason;
  stopSequence?: string | null;
  usage?: TokenUsage;
  toolCalls?: LlmToolCall[];
  annotations?: LlmAnnotation[];
  images?: MediaAssetRef[];
  videos?: MediaAssetRef[];
  audios?: MediaAssetRef[];
  metadata?: Record<string, JsonValue>;
}
