/**
 * LLM 服务提供商类型配置
 */

import type { ProviderType, ProviderTypeInfo, LlmModelInfo } from '../types/llm-profiles';

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
 * 预设模板接口
 */
export interface LlmPreset {
  type: ProviderType;
  name: string;
  description: string;
  defaultBaseUrl: string;
  logoUrl?: string;
  defaultModels?: LlmModelInfo[];
}

/**
 * LLM 服务商预设模板列表
 * 用于快速创建常用服务配置
 */
export const llmPresets: LlmPreset[] = [
  // OpenAI 官方
  {
    type: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 官方服务',
    defaultBaseUrl: 'https://api.openai.com',
    logoUrl: 'https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png',
    defaultModels: [
      { id: 'gpt-4o', name: 'GPT-4o', group: 'GPT-4', provider: 'openai', capabilities: { vision: true } },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', group: 'GPT-4', provider: 'openai' },
      { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', group: 'GPT-4', provider: 'openai' },
      { id: 'o1', name: 'o1', group: 'o1', provider: 'openai' },
      { id: 'o1-mini', name: 'o1-mini', group: 'o1', provider: 'openai' },
    ],
  },
  // DeepSeek
  {
    type: 'openai',
    name: 'DeepSeek',
    description: '深度求索 API',
    defaultBaseUrl: 'https://api.deepseek.com',
    logoUrl: 'https://www.deepseek.com/favicon.ico',
    defaultModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', group: 'DeepSeek', provider: 'deepseek' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', group: 'DeepSeek', provider: 'deepseek' },
    ],
  },
  // Moonshot (月之暗面 Kimi)
  {
    type: 'openai',
    name: 'Moonshot',
    description: '月之暗面 Kimi API',
    defaultBaseUrl: 'https://api.moonshot.cn',
    logoUrl: 'https://platform.moonshot.cn/favicon.ico',
    defaultModels: [
      { id: 'moonshot-v1-8k', name: 'Moonshot V1 8K', group: 'Moonshot', provider: 'moonshot' },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K', group: 'Moonshot', provider: 'moonshot' },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', group: 'Moonshot', provider: 'moonshot' },
    ],
  },
  // 智谱 AI
  {
    type: 'openai',
    name: '智谱 AI',
    description: '智谱 GLM API',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    logoUrl: 'https://open.bigmodel.cn/favicon.ico',
    defaultModels: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', group: 'GLM-4', provider: 'zhipu' },
      { id: 'glm-4-0520', name: 'GLM-4 0520', group: 'GLM-4', provider: 'zhipu' },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', group: 'GLM-4', provider: 'zhipu' },
      { id: 'glm-4v-plus', name: 'GLM-4V Plus', group: 'GLM-4', provider: 'zhipu', capabilities: { vision: true } },
    ],
  },
  // Groq
  {
    type: 'openai',
    name: 'Groq',
    description: 'Groq 高速推理 API',
    defaultBaseUrl: 'https://api.groq.com/openai',
    logoUrl: 'https://groq.com/favicon.ico',
    defaultModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', group: 'Llama', provider: 'groq' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', group: 'Llama', provider: 'groq' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', group: 'Mixtral', provider: 'groq' },
    ],
  },
  // Google Gemini
  {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Google Gemini API',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    logoUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
    defaultModels: [
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', group: 'Gemini 2.0', provider: 'gemini', capabilities: { vision: true } },
      { id: 'gemini-exp-1206', name: 'Gemini Exp 1206', group: 'Gemini Exp', provider: 'gemini', capabilities: { vision: true } },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', group: 'Gemini 1.5', provider: 'gemini', capabilities: { vision: true } },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', group: 'Gemini 1.5', provider: 'gemini', capabilities: { vision: true } },
    ],
  },
  // Anthropic Claude
  {
    type: 'claude',
    name: 'Anthropic Claude',
    description: 'Anthropic Claude API',
    defaultBaseUrl: 'https://api.anthropic.com',
    logoUrl: 'https://www.anthropic.com/images/icons/favicon-32x32.png',
    defaultModels: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', group: 'Claude 4', provider: 'anthropic', capabilities: { vision: true } },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', group: 'Claude 4', provider: 'anthropic', capabilities: { vision: true } },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', group: 'Claude 3.5', provider: 'anthropic', capabilities: { vision: true } },
    ],
  },
  // Ollama (本地)
  {
    type: 'openai',
    name: 'Ollama',
    description: '本地 Ollama 服务',
    defaultBaseUrl: 'http://localhost:11434',
    logoUrl: 'https://ollama.com/public/icon-32x32.png',
  },
];

/**
 * 根据类型获取提供商信息
 */
export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return providerTypes.find(p => p.type === type);
}

/**
 * 根据名称获取预设模板
 */
export function getPresetByName(name: string): LlmPreset | undefined {
  return llmPresets.find(p => p.name === name);
}