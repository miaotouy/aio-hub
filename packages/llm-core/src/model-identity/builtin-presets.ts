import type { ModelIdentityPresetRule } from "./types";

const OPENAI_EMBEDDING_REFERENCE =
  "https://platform.openai.com/docs/guides/embeddings/embedding-models";
const GOOGLE_EMBEDDING_REFERENCE =
  "https://ai.google.dev/gemini-api/docs/embeddings";

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
        reference: GOOGLE_EMBEDDING_REFERENCE,
      },
    },
    {
      id: "identity-google-models-gemini-embedding-001",
      routeModelId: "models/gemini-embedding-001",
      identity: { canonicalId: "google/gemini-embedding-001" },
      evidence: {
        kind: "vendor-doc",
        reference: GOOGLE_EMBEDDING_REFERENCE,
      },
    },
    {
      id: "identity-google-gemini-embedding-2",
      routeModelId: "gemini-embedding-2",
      identity: { canonicalId: "google/gemini-embedding-2" },
      evidence: {
        kind: "vendor-doc",
        reference: GOOGLE_EMBEDDING_REFERENCE,
      },
    },
    {
      id: "identity-google-models-gemini-embedding-2",
      routeModelId: "models/gemini-embedding-2",
      identity: { canonicalId: "google/gemini-embedding-2" },
      evidence: {
        kind: "vendor-doc",
        reference: GOOGLE_EMBEDDING_REFERENCE,
      },
    },
    {
      id: "identity-google-gemini-embedding-2-preview",
      routeModelId: "gemini-embedding-2-preview",
      identity: {
        canonicalId: "google/gemini-embedding-2",
        revision: "preview",
      },
      evidence: {
        kind: "maintainer-verified",
        reference: GOOGLE_EMBEDDING_REFERENCE,
        note:
          "Historical preview route. Keep its embedding space separate from the stable route.",
      },
    },
    {
      id: "identity-google-models-gemini-embedding-2-preview",
      routeModelId: "models/gemini-embedding-2-preview",
      identity: {
        canonicalId: "google/gemini-embedding-2",
        revision: "preview",
      },
      evidence: {
        kind: "maintainer-verified",
        reference: GOOGLE_EMBEDDING_REFERENCE,
        note:
          "Historical preview route. Keep its embedding space separate from the stable route.",
      },
    },
    {
      id: "identity-google-embedding-001",
      routeModelId: "embedding-001",
      identity: { canonicalId: "google/embedding-001" },
      evidence: {
        kind: "maintainer-verified",
        reference: GOOGLE_EMBEDDING_REFERENCE,
        note: "Legacy Google embedding route retained for existing deployments.",
      },
    },
    {
      id: "identity-google-models-embedding-001",
      routeModelId: "models/embedding-001",
      identity: { canonicalId: "google/embedding-001" },
      evidence: {
        kind: "maintainer-verified",
        reference: GOOGLE_EMBEDDING_REFERENCE,
        note: "Legacy Google embedding route retained for existing deployments.",
      },
    },
    {
      id: "identity-google-text-embedding-004",
      routeModelId: "text-embedding-004",
      identity: { canonicalId: "google/text-embedding-004" },
      evidence: {
        kind: "maintainer-verified",
        reference: GOOGLE_EMBEDDING_REFERENCE,
        note: "Legacy Google embedding route retained for existing deployments.",
      },
    },
    {
      id: "identity-google-models-text-embedding-004",
      routeModelId: "models/text-embedding-004",
      identity: { canonicalId: "google/text-embedding-004" },
      evidence: {
        kind: "maintainer-verified",
        reference: GOOGLE_EMBEDDING_REFERENCE,
        note: "Legacy Google embedding route retained for existing deployments.",
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
