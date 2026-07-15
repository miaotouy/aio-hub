import type { JsonValue } from "./json";
import type { ProviderProfile } from "./provider";
import type { WireRequest, WireResponse } from "./transport";

export interface RerankRequest {
  model: string;
  query: string;
  documents: string[];
  topN?: number;
  requestId?: string;
  extensions?: Record<string, JsonValue>;
}

export interface RerankResult {
  index: number;
  relevanceScore: number;
  document?: string;
}

export interface RerankResponse {
  results: RerankResult[];
  usage?: { totalTokens?: number };
}

export interface RerankProviderAdapter {
  readonly id: string;
  buildRequest(profile: ProviderProfile, request: RerankRequest): WireRequest;
  parseResponse(response: WireResponse): Promise<RerankResponse>;
}
