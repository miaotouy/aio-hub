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
];

export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return providerTypes.find((p) => p.type === type);
}