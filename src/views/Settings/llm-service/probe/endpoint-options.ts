import type { LlmProfile, ProviderType } from "@/types/llm-profiles";
import type { ProbeCapability } from "@aiohub/llm-core";
import type { ProbeEndpointType } from "./types";

type CustomEndpointKey = keyof NonNullable<LlmProfile["customEndpoints"]>;

export interface ProbeEndpointDefinition {
  value: ProbeEndpointType;
  label: string;
  defaultPath: string;
  configKey?: CustomEndpointKey;
  capability?: ProbeCapability;
  providerType?: ProviderType;
  supportsStream: boolean;
  requiresCostConsent?: boolean;
}

export const PROBE_ENDPOINT_DEFINITIONS: ProbeEndpointDefinition[] = [
  {
    value: "auto",
    label: "自动识别",
    defaultPath: "按模型能力和渠道类型选择",
    supportsStream: true,
  },
  {
    value: "openai-chat",
    label: "OpenAI Chat Completions",
    defaultPath: "/v1/chat/completions",
    configKey: "chatCompletions",
    capability: "chat",
    providerType: "openai-compatible",
    supportsStream: true,
  },
  {
    value: "openai-responses",
    label: "OpenAI Responses",
    defaultPath: "/v1/responses",
    configKey: "responses",
    capability: "chat",
    providerType: "openai-responses",
    supportsStream: true,
  },
  {
    value: "anthropic-messages",
    label: "Anthropic Messages",
    defaultPath: "/v1/messages",
    configKey: "anthropicMessages",
    capability: "chat",
    providerType: "claude",
    supportsStream: true,
  },
  {
    value: "gemini-generate-content",
    label: "Gemini GenerateContent",
    defaultPath: "/v1beta/models/{model}:generateContent",
    configKey: "geminiGenerateContent",
    capability: "chat",
    providerType: "gemini",
    supportsStream: true,
  },
  {
    value: "embeddings",
    label: "Embeddings",
    defaultPath: "/v1/embeddings",
    configKey: "embeddings",
    capability: "embedding",
    providerType: "openai-compatible",
    supportsStream: false,
  },
  {
    value: "jina-rerank",
    label: "Jina Rerank",
    defaultPath: "/v1/rerank",
    configKey: "rerank",
    capability: "rerank",
    providerType: "openai-compatible",
    supportsStream: false,
  },
  {
    value: "image-generation",
    label: "Image Generation",
    defaultPath: "/v1/images/generations",
    configKey: "imagesGenerations",
    capability: "image",
    providerType: "openai-compatible",
    supportsStream: false,
    requiresCostConsent: true,
  },
];

const OPENAI_CHAT_PROFILE_TYPES = new Set<ProviderType>([
  "openai",
  "openai-compatible",
  "deepseek",
  "siliconflow",
  "groq",
  "ollama",
  "openrouter",
  "xai",
]);

export function getProbeEndpointDefinition(
  endpointType: ProbeEndpointType = "auto"
): ProbeEndpointDefinition {
  return (
    PROBE_ENDPOINT_DEFINITIONS.find((item) => item.value === endpointType) ??
    PROBE_ENDPOINT_DEFINITIONS[0]
  );
}

export function resolveEffectiveProbeEndpointType(
  profile: LlmProfile,
  capability: ProbeCapability,
  requestedEndpointType: ProbeEndpointType = "auto"
): ProbeEndpointType {
  if (requestedEndpointType !== "auto") return requestedEndpointType;

  switch (capability) {
    case "embedding":
      return "embeddings";
    case "rerank":
      return "jina-rerank";
    case "image":
      return "image-generation";
    case "chat":
      if (profile.type === "openai-responses") return "openai-responses";
      if (profile.type === "claude") return "anthropic-messages";
      if (profile.type === "gemini") return "gemini-generate-content";
      if (OPENAI_CHAT_PROFILE_TYPES.has(profile.type)) return "openai-chat";
      return "auto";
    case "audio":
    case "video":
    case "music":
      return "auto";
  }
}

export function getConfiguredProbeEndpoint(
  profile: LlmProfile,
  endpointType: ProbeEndpointType
): string | undefined {
  const definition = getProbeEndpointDefinition(endpointType);
  if (!definition.configKey) return undefined;
  const configured = profile.customEndpoints?.[definition.configKey];
  if (configured) return configured;

  if (
    (endpointType === "openai-responses" &&
      profile.type === "openai-responses") ||
    (endpointType === "anthropic-messages" && profile.type === "claude") ||
    (endpointType === "gemini-generate-content" && profile.type === "gemini") ||
    (endpointType === "openai-chat" &&
      OPENAI_CHAT_PROFILE_TYPES.has(profile.type))
  ) {
    return profile.customEndpoints?.chatCompletions;
  }
  return undefined;
}

export function resolveProbeTarget(
  profile: LlmProfile,
  endpointType: ProbeEndpointType = "auto"
): {
  profile: LlmProfile;
  capability?: ProbeCapability;
  supportsStream: boolean;
} {
  const definition = getProbeEndpointDefinition(endpointType);
  if (endpointType === "auto") {
    return { profile, supportsStream: true };
  }

  const configuredEndpoint = getConfiguredProbeEndpoint(profile, endpointType);
  const customEndpoints = { ...(profile.customEndpoints ?? {}) };
  if (
    endpointType === "openai-chat" ||
    endpointType === "openai-responses" ||
    endpointType === "anthropic-messages" ||
    endpointType === "gemini-generate-content"
  ) {
    delete customEndpoints.chatCompletions;
  }
  if (definition.configKey) {
    if (configuredEndpoint) {
      customEndpoints[definition.configKey] = configuredEndpoint;
    } else {
      delete customEndpoints[definition.configKey];
    }
  }

  return {
    profile: {
      ...profile,
      type: definition.providerType ?? profile.type,
      customEndpoints,
    },
    capability: definition.capability,
    supportsStream: definition.supportsStream,
  };
}
