import type { ModelIdentityPresetRule } from "./types";

const OPENAI_EMBEDDING_REFERENCE =
  "https://platform.openai.com/docs/guides/embeddings/embedding-models";

export const DEFAULT_MODEL_IDENTITY_PRESETS: readonly ModelIdentityPresetRule[] =
  [
    {
      id: "identity-openai-text-embedding-3-small",
      routeModelId: "text-embedding-3-small",
      identity: { canonicalId: "openai/text-embedding-3-small" },
      evidence: { kind: "vendor-doc", reference: OPENAI_EMBEDDING_REFERENCE },
    },
    {
      id: "identity-openai-namespaced-text-embedding-3-small",
      routeModelId: "openai/text-embedding-3-small",
      identity: { canonicalId: "openai/text-embedding-3-small" },
      evidence: { kind: "vendor-doc", reference: OPENAI_EMBEDDING_REFERENCE },
    },
    {
      id: "identity-openai-text-embedding-3-large",
      routeModelId: "text-embedding-3-large",
      identity: { canonicalId: "openai/text-embedding-3-large" },
      evidence: { kind: "vendor-doc", reference: OPENAI_EMBEDDING_REFERENCE },
    },
    {
      id: "identity-openai-namespaced-text-embedding-3-large",
      routeModelId: "openai/text-embedding-3-large",
      identity: { canonicalId: "openai/text-embedding-3-large" },
      evidence: { kind: "vendor-doc", reference: OPENAI_EMBEDDING_REFERENCE },
    },
    {
      id: "identity-google-gemini-embedding-001",
      routeModelId: "gemini-embedding-001",
      identity: { canonicalId: "google/gemini-embedding-001" },
      evidence: {
        kind: "vendor-doc",
        reference: "https://ai.google.dev/gemini-api/docs/embeddings",
      },
    },
    {
      id: "identity-google-models-gemini-embedding-001",
      routeModelId: "models/gemini-embedding-001",
      identity: { canonicalId: "google/gemini-embedding-001" },
      evidence: {
        kind: "vendor-doc",
        reference: "https://ai.google.dev/gemini-api/docs/embeddings",
      },
    },
    {
      id: "identity-qwen-text-embedding-v4",
      routeModelId: "text-embedding-v4",
      identity: { canonicalId: "qwen/text-embedding-v4" },
      evidence: {
        kind: "vendor-doc",
        reference:
          "https://help.aliyun.com/zh/model-studio/text-embedding-synchronous-api",
      },
    },
    {
      id: "identity-baai-bge-m3",
      routeModelId: "BAAI/bge-m3",
      identity: { canonicalId: "baai/bge-m3" },
      evidence: {
        kind: "provider-catalog",
        reference: "https://huggingface.co/BAAI/bge-m3",
      },
    },
  ];
