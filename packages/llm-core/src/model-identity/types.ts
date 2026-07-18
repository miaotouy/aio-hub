export type ModelIdentitySource = "builtin" | "provider" | "user";

export interface ModelIdentity {
  canonicalId: string;
  revision?: string;
  source: ModelIdentitySource;
}

export interface ModelIdentitySuggestion {
  identity: ModelIdentity;
  confidence: "exact" | "suggested";
  evidence: string;
}

export interface ModelRouteRef {
  profileId: string;
  modelId: string;
}

export interface ModelIdentityPresetRule {
  id: string;
  routeModelId: string;
  identity: Pick<ModelIdentity, "canonicalId" | "revision">;
  qualifiers?: {
    declaredOwners?: string[];
    routeNamespaces?: string[];
  };
  evidence: {
    kind: "vendor-doc" | "provider-catalog" | "maintainer-verified";
    reference: string;
    note?: string;
  };
}

export interface ModelIdentityValidationResult {
  valid: boolean;
  normalizedIdentity?: ModelIdentity;
  errors: string[];
}

export interface ModelIdentityLike {
  id: string;
  modelIdentity?: ModelIdentity;
}

export interface ModelProfileLike<TModel extends ModelIdentityLike = ModelIdentityLike> {
  id: string;
  models: TModel[];
}

export interface EmbeddingSpaceDescriptorV1 {
  schemaVersion: 1;
  model: {
    canonicalId: string;
    revision?: string;
  };
  dimensions: number;
  queryTaskType?: EmbeddingTaskType;
  documentTaskType?: EmbeddingTaskType;
  encodingFormat: EmbeddingEncodingFormat;
  similarity: "cosine";
  adapterContractVersion: number;
}

export interface EmbeddingSpaceInput {
  modelIdentity: Pick<ModelIdentity, "canonicalId" | "revision">;
  dimensions: number;
  queryTaskType?: EmbeddingTaskType;
  documentTaskType?: EmbeddingTaskType;
  encodingFormat?: EmbeddingEncodingFormat;
  adapterContractVersion?: number;
}
import type {
  EmbeddingEncodingFormat,
  EmbeddingTaskType,
} from "../types/embedding";
