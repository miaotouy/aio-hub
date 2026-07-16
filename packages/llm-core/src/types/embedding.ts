import type { JsonValue } from "./json";
import type { ProviderProfile } from "./provider";
import type { WireRequest, WireResponse } from "./transport";

export type EmbeddingTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING";

export type EmbeddingEncodingFormat =
  "float" | "int8" | "uint8" | "binary" | "ubinary";

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  dimensions?: number;
  user?: string;
  taskType?: EmbeddingTaskType;
  title?: string;
  encodingFormat?: EmbeddingEncodingFormat;
  requestId?: string;
  extensions?: Record<string, JsonValue>;
}

export interface EmbeddingObject {
  embedding: number[];
  index: number;
  object: "embedding";
}

export interface EmbeddingResponse {
  data: EmbeddingObject[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  object: "list";
}

export interface EmbeddingProviderAdapter {
  readonly id: string;
  buildRequest(
    profile: ProviderProfile,
    request: EmbeddingRequest
  ): Promise<WireRequest> | WireRequest;
  parseResponse(
    response: WireResponse,
    request: EmbeddingRequest
  ): Promise<EmbeddingResponse>;
}
