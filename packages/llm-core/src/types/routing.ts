// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Stable wire-protocol identifiers used by model execution routing.
 *
 * These values intentionally describe the protocol adapter, not the profile
 * identity or model owner. A profile may retain its own provider type while
 * using one of these adapters through a model-level routing binding.
 */
export type LlmAdapterId =
  | "openai-chat-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini-generate-content"
  | "cohere-chat"
  | "vertex-google"
  | "vertex-anthropic"
  | "openai-embeddings"
  | "jina-rerank"
  | "openai-image-generation"
  | "suno-newapi"
  | "minimax-music";

/** Operations for which a model can have an independent execution route. */
export type LlmOperation =
  "chat" | "embedding" | "rerank" | "image" | "audio" | "video" | "music";

export type ModelRouteSource =
  "manual" | "discovered" | "probe" | "profile-default";

/** A user-selected or system-confirmed route for one model operation. */
export interface ModelRouteBinding {
  adapterId: LlmAdapterId;
  /** Service-specific endpoint type retained for round-tripping and UI. */
  endpointType?: string;
  /** Explicit endpoint path or URL for this route. */
  endpoint?: string;
  source?: Exclude<ModelRouteSource, "profile-default">;
}

/** Persistable model routing information. */
export interface LlmModelRouting {
  bindings?: Partial<Record<LlmOperation, ModelRouteBinding>>;
  /** Endpoint types reported by the remote model-list API. */
  supportedEndpointTypes?: string[];
  discoveredAt?: string;
}

/** The minimum profile shape required by the shared execution resolver. */
export interface LlmExecutionProfile {
  type: string;
  customEndpoints?: object;
}

/** The minimum model shape required by the shared execution resolver. */
export interface LlmExecutionModel {
  id: string;
  routing?: LlmModelRouting;
}

/**
 * Legacy provider defaults. `adapterId` is observable protocol identity;
 * callers preserve the original profile type for this fallback so all legacy
 * provider-specific headers, URLs and parameter handling remain unchanged.
 */
export interface ProviderExecutionDefault {
  defaultAdapterId: LlmAdapterId;
  defaultOperation: LlmOperation;
  operationAdapters?: Partial<Record<LlmOperation, LlmAdapterId>>;
}

/**
 * A model execution route resolved for a concrete operation.
 *
 * `effectiveProfile` is a shallow compatibility view. It only changes its
 * provider type or endpoint when a model-level route overrides a legacy
 * profile default.
 */
export interface ResolvedModelExecution<TProfile extends LlmExecutionProfile> {
  adapterId: LlmAdapterId;
  operation: LlmOperation;
  endpoint?: string;
  routeSource: ModelRouteSource;
  effectiveProfile: TProfile;
}
