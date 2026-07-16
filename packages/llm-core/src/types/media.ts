import type { JsonValue, LocalFileRef } from "./json";
import type { ProviderProfile } from "./provider";
import type { LlmMessage } from "./request";
import type { MediaAssetRef } from "./response";
import type { WireRequest, WireResponse } from "./transport";

export type MediaInputSource =
  | { kind: "remote-url"; url: string }
  | { kind: "inline-base64"; data: string; contentType: string }
  | { kind: "bytes"; data: Uint8Array; contentType: string }
  | { kind: "local-file"; ref: LocalFileRef };

export interface MediaInput {
  type: "image" | "audio" | "video" | "mask";
  source: MediaInputSource;
  role?: "reference" | "first_frame" | "last_frame";
  filename?: string;
}

export interface SyncMediaRequest {
  kind: "image" | "audio";
  model: string;
  prompt: string;
  messages?: LlmMessage[];
  inputs?: MediaInput[];
  mask?: MediaInput;
  count?: number;
  size?: string;
  quality?: string;
  style?: string;
  responseFormat?: string;
  seed?: number;
  negativePrompt?: string;
  guidanceScale?: number;
  inferenceSteps?: number;
  aspectRatio?: string;
  audio?: {
    voice?: string;
    format?: string;
    speed?: number;
    pitch?: number;
  };
  extensions?: Record<string, JsonValue>;
}

export interface SyncMediaResponse {
  content: string;
  assets: MediaAssetRef[];
  metadata?: Record<string, JsonValue>;
  binary?: Uint8Array;
}

export interface SyncMediaProviderAdapter {
  readonly id: string;
  buildRequest(
    profile: ProviderProfile,
    request: SyncMediaRequest
  ): WireRequest;
  parseResponse(
    response: WireResponse,
    request: SyncMediaRequest
  ): Promise<SyncMediaResponse>;
}
