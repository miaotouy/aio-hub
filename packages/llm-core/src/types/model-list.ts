import type { JsonValue } from "./json";
import type { ProviderProfile } from "./provider";
import type { WireRequest, WireResponse } from "./transport";

export interface ModelListRequest {
  provider: string;
  endpoint: string;
  includeAllOutputModalities?: boolean;
}

export interface ProviderModelInfo {
  id: string;
  name: string;
  provider: string;
  group?: string;
  description?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  supportedParameters?: string[];
  supportedGenerationMethods?: string[];
  pricing?: Record<string, string | number>;
  raw?: JsonValue;
}

export interface ModelListResponse {
  models: ProviderModelInfo[];
  raw: JsonValue;
}

export interface ModelListProviderAdapter {
  buildRequest(profile: ProviderProfile, request: ModelListRequest): WireRequest;
  parseResponse(
    response: WireResponse,
    request: ModelListRequest
  ): Promise<ModelListResponse>;
}
