/**
 * LLM 服务提供商类型配置
 */

import type { ProviderType, ProviderTypeInfo } from '../types/llm-profiles';

/**
 * 支持的 LLM 服务提供商类型列表
 */
export const providerTypes: ProviderTypeInfo[] = [
  {
    type: 'openai',
    name: 'OpenAI-Compatible',
    description: 'OpenAI 官方接口及所有兼容格式的服务（如 Ollama、DeepSeek 等）',
    defaultBaseUrl: 'https://api.openai.com',
    supportsModelList: true,
    modelListEndpoint: '/v1/models',
  },
  {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Google Gemini API',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    supportsModelList: true,
    modelListEndpoint: '/v1beta/models',
  },
  {
    type: 'claude',
    name: 'Anthropic Claude',
    description: 'Anthropic Claude API',
    defaultBaseUrl: 'https://api.anthropic.com',
    supportsModelList: false,
  },
];

/**
 * 根据类型获取提供商信息
 */
export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return providerTypes.find(p => p.type === type);
}