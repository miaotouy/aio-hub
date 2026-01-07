import type { ProviderType, LlmParameterSupport } from "../types";

export interface ProviderTypeInfo {
  type: ProviderType;
  name: string;
  description: string;
  defaultBaseUrl: string;
  supportsModelList: boolean;
  modelListEndpoint?: string;
  supportedParameters?: LlmParameterSupport;
}

export const providerTypes: ProviderTypeInfo[] = [
  {
    type: "openai",
    name: "OpenAI-Compatible",
    description: "OpenAI 官方接口及所有兼容格式的服务",
    defaultBaseUrl: "https://api.openai.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      stop: true,
      thinking: true,
      webSearch: true,
    },
  },
  {
    type: "openai-responses",
    name: "OpenAI Responses",
    description: "OpenAI 有状态会话接口 (Beta)",
    defaultBaseUrl: "https://api.openai.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      thinking: true,
    },
  },
  {
    type: "gemini",
    name: "Google Gemini",
    description: "Google Gemini API",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      thinking: true,
    },
  },
  {
    type: "claude",
    name: "Anthropic Claude",
    description: "Anthropic Claude API",
    defaultBaseUrl: "https://api.anthropic.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      thinking: true,
    },
  },
  {
    type: "cohere",
    name: "Cohere",
    description: "Cohere API (V2)",
    defaultBaseUrl: "https://api.cohere.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      thinking: true,
    },
  },
  {
    type: "vertexai",
    name: "Vertex AI",
    description: "Google Cloud Vertex AI",
    defaultBaseUrl: "https://{location}-aiplatform.googleapis.com",
    supportsModelList: false,
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      thinking: true,
    },
  },
];

export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return providerTypes.find((p) => p.type === type);
}