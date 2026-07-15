import type { JsonValue } from "./json";
import type { MediaInput } from "./media";
import type { ProviderProfile } from "./provider";
import type { MediaAssetRef } from "./response";
import type { WireRequest, WireResponse } from "./transport";

export interface AsyncMediaRequest {
  kind: "video" | "music";
  model: string;
  prompt: string;
  inputs?: MediaInput[];
  parameters?: Record<string, JsonValue>;
}

export type AsyncMediaTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AsyncMediaTaskSnapshot {
  id: string;
  status: AsyncMediaTaskStatus;
  progress?: number;
  assets?: MediaAssetRef[];
  error?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AsyncMediaTaskAdapter {
  readonly id: string;
  buildCreateRequest(
    profile: ProviderProfile,
    request: AsyncMediaRequest
  ): WireRequest;
  parseCreateResponse(
    response: WireResponse,
    request: AsyncMediaRequest
  ): Promise<AsyncMediaTaskSnapshot>;
  buildPollRequest(
    profile: ProviderProfile,
    request: AsyncMediaRequest,
    task: AsyncMediaTaskSnapshot
  ): WireRequest;
  parsePollResponse(
    response: WireResponse,
    request: AsyncMediaRequest,
    previous: AsyncMediaTaskSnapshot
  ): Promise<AsyncMediaTaskSnapshot>;
  buildResultRequests?(
    profile: ProviderProfile,
    request: AsyncMediaRequest,
    task: AsyncMediaTaskSnapshot
  ): WireRequest[];
  parseResultResponses?(
    responses: WireResponse[],
    request: AsyncMediaRequest,
    task: AsyncMediaTaskSnapshot
  ): Promise<AsyncMediaTaskSnapshot>;
  buildCancelRequest?(
    profile: ProviderProfile,
    request: AsyncMediaRequest,
    task: AsyncMediaTaskSnapshot
  ): WireRequest | undefined;
}
