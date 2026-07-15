import type { JsonValue } from "./json";
import type { LlmRequest } from "./request";
import type {
  LlmResponse,
  LlmToolCall,
  MediaAssetRef,
  TokenUsage,
} from "./response";
import type { WireRequest, WireResponse } from "./transport";

export interface ProviderProfile {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  endpoints?: Record<string, string>;
  options?: Record<string, JsonValue>;
}

export type LlmStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "tool-call"; toolCall: LlmToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "partial-image"; asset: MediaAssetRef; index: number }
  | { type: "completed"; response: LlmResponse };

export interface StreamDecoderContext {
  request: LlmRequest;
  response: Pick<WireResponse, "status" | "statusText" | "headers">;
}

export interface ProviderStreamDecoder {
  push(chunk: Uint8Array): LlmStreamEvent[];
  finish(): LlmStreamEvent[];
}

export interface ProviderAdapter {
  readonly id: string;
  buildRequest(
    profile: ProviderProfile,
    request: LlmRequest
  ): Promise<WireRequest> | WireRequest;
  parseResponse(response: WireResponse): Promise<LlmResponse>;
  createStreamDecoder(context: StreamDecoderContext): ProviderStreamDecoder;
}
