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
    modelListEndpoint: 'models',
  },
  {
    type: 'openai-responses',
    name: 'OpenAI Responses',
    description: 'OpenAI Responses API - 新一代有状态交互接口，支持工具调用、推理等高级功能',
    defaultBaseUrl: 'https://api.openai.com',
    supportsModelList: true,
    modelListEndpoint: 'models',
  },
  {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Google Gemini API',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    supportsModelList: true,
    modelListEndpoint: 'models',
  },
  {
    type: 'claude',
    name: 'Anthropic Claude',
    description: 'Anthropic Claude API',
    defaultBaseUrl: 'https://api.anthropic.com',
    supportsModelList: true,
    modelListEndpoint: 'models',
  },
  {
    type: 'cohere',
    name: 'Cohere',
    description: 'Cohere API (v2 格式)',
    defaultBaseUrl: 'https://api.cohere.com',
    supportsModelList: true,
    modelListEndpoint: 'models',
  },
  {
    type: 'vertexai',
    name: 'Vertex AI',
    description: 'Google Cloud Vertex AI API',
    defaultBaseUrl: 'https://us-central1-aiplatform.googleapis.com',
    supportsModelList: true,
    modelListEndpoint: 'models',
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
    logoUrl: '/model-icons/openai.svg',
    defaultModels: [
      { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', group: 'GPT-4', provider: 'openai', capabilities: { vision: true } },
      { id: 'gpt-4o', name: 'GPT-4o', group: 'GPT-4', provider: 'openai', capabilities: { vision: true } },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', group: 'GPT-4', provider: 'openai' },
      { id: 'o1', name: 'o1', group: 'o1', provider: 'openai' },
      { id: 'o1-mini', name: 'o1-mini', group: 'o1', provider: 'openai' },
    ],
  },
  // OpenAI Responses API
  {
    type: 'openai-responses',
    name: 'OpenAI Responses',
    description: 'OpenAI Responses API - 支持工具调用和推理的有状态交互',
    defaultBaseUrl: 'https://api.openai.com',
    logoUrl: '/model-icons/openai.svg',
    defaultModels: [
      { id: 'gpt-4.1', name: 'GPT-4.1', group: 'GPT-4', provider: 'openai', capabilities: { vision: true, toolUse: true, webSearch: true }, description: '支持文件搜索、网络搜索等内置工具' },
      { id: 'o3-mini', name: 'o3-mini', group: 'o3', provider: 'openai', capabilities: { toolUse: true }, description: '推理优化模型，支持可调节推理力度' },
      { id: 'o1-2024-12-17', name: 'o1 (2024-12-17)', group: 'o1', provider: 'openai', capabilities: { toolUse: true }, description: '推理模型' },
    ],
  },
  // DeepSeek
  {
    type: 'openai',
    name: 'DeepSeek',
    description: '深度求索 API',
    defaultBaseUrl: 'https://api.deepseek.com',
    logoUrl: '/model-icons/deepseek-color.svg',
    defaultModels: [
      { id: 'deepseek-chat', name: 'DeepSeek V3.2 Chat', group: 'DeepSeek', provider: 'deepseek', description: '极致性价比 MoE 架构' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', group: 'DeepSeek', provider: 'deepseek', description: 'Dense推理旗舰模型' },
    ],
  },
  // Moonshot (月之暗面 Kimi)
  {
    type: 'openai',
    name: 'Moonshot',
    description: '月之暗面 Kimi API',
    defaultBaseUrl: 'https://api.moonshot.cn',
    logoUrl: '/model-icons/moonshot.svg',
    defaultModels: [
      { id: 'kimi-k2-instruct', name: 'Kimi K2 Instruct', group: 'Kimi K2', provider: 'moonshot', description: '200万tokens超长上下文，全球最强长文本处理' },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', group: 'Moonshot V1', provider: 'moonshot' },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K', group: 'Moonshot V1', provider: 'moonshot' },
    ],
  },
  // 智谱 AI
  {
    type: 'openai',
    name: '智谱 AI',
    description: '智谱 GLM API',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    logoUrl: '/model-icons/zhipu-color.svg',
    defaultModels: [
      { id: 'glm-4.6', name: 'GLM-4.6', group: 'GLM-4.6', provider: 'zhipu', description: '100万tokens上下文，SAA架构升级' },
      { id: 'glm-4.6-air', name: 'GLM-4.6 Air', group: 'GLM-4.6', provider: 'zhipu', description: '高速Agent/高并发优化' },
      { id: 'glm-4.6v', name: 'GLM-4.6V', group: 'GLM-4.6', provider: 'zhipu', capabilities: { vision: true }, description: '多模态视觉语言模型' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', group: 'GLM-4', provider: 'zhipu' },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', group: 'GLM-4', provider: 'zhipu' },
    ],
  },
  // Groq
  {
    type: 'openai',
    name: 'Groq',
    description: 'Groq 高速推理 API',
    defaultBaseUrl: 'https://api.groq.com/openai',
    logoUrl: '/model-icons/groq.svg',
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
    logoUrl: '/model-icons/gemini-color.svg',
    defaultModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', group: 'Gemini 2.5', provider: 'gemini', capabilities: { vision: true }, description: '最新多模态旗舰，支持Adaptive Thinking' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', group: 'Gemini 2.5', provider: 'gemini', capabilities: { vision: true }, description: '效率/低成本优化版本' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', group: 'Gemini 2.5', provider: 'gemini', capabilities: { vision: true }, description: '端侧AI轻量版' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', group: 'Gemini 实时', provider: 'gemini', capabilities: { vision: true }, description: '实时更新的最新Flash版本' },
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
    logoUrl: '/model-icons/claude-color.svg',
    defaultModels: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', group: 'Claude 4', provider: 'anthropic', capabilities: { vision: true }, description: '编程/Agent之王，SWE-bench 77.2%，可自主运行30h+' },
      { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', group: 'Claude 4', provider: 'anthropic', capabilities: { vision: true }, description: '旗舰推理模型' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', group: 'Claude 3.5', provider: 'anthropic', capabilities: { vision: true } },
    ],
  },
  // Cohere
  {
    type: 'cohere',
    name: 'Cohere',
    description: 'Cohere API',
    defaultBaseUrl: 'https://api.cohere.com',
    logoUrl: '/model-icons/cohere-color.svg',
    defaultModels: [
      { id: 'command-r-plus', name: 'Command R+', group: 'Command', provider: 'cohere' },
      { id: 'command-r', name: 'Command R', group: 'Command', provider: 'cohere' },
      { id: 'command', name: 'Command', group: 'Command', provider: 'cohere' },
      { id: 'command-light', name: 'Command Light', group: 'Command', provider: 'cohere' },
    ],
  },
  // Hugging Face (使用 OpenAI 兼容的 Chat Completion API)
  {
    type: 'openai',
    name: 'Hugging Face',
    description: 'Hugging Face Chat Completion API (OpenAI 兼容)',
    defaultBaseUrl: 'https://api-inference.huggingface.co',
    logoUrl: '/model-icons/huggingface-color.svg',
    defaultModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', group: 'Llama', provider: 'huggingface' },
      { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', group: 'Llama', provider: 'huggingface' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', group: 'Mixtral', provider: 'huggingface' },
      { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini 4K', group: 'Phi', provider: 'huggingface' },
    ],
  },
  // Google Vertex AI
  {
    type: 'vertexai',
    name: 'Vertex AI',
    description: 'Google Cloud Vertex AI',
    defaultBaseUrl: 'https://us-central1-aiplatform.googleapis.com',
    logoUrl: '/model-icons/vertexai-color.svg',
    defaultModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', group: 'Gemini 2.5', provider: 'google', capabilities: { vision: true } },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', group: 'Gemini 2.5', provider: 'google', capabilities: { vision: true } },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', group: 'Gemini 1.5', provider: 'google', capabilities: { vision: true } },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', group: 'Gemini 1.5', provider: 'google', capabilities: { vision: true } },
    ],
  },
  // 火山引擎（字节跳动）
  {
    type: 'openai',
    name: '火山引擎',
    description: '字节跳动火山引擎 API',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    logoUrl: '/model-icons/volcengine-color.svg',
    defaultModels: [
      { id: 'doubao-pro-256k', name: '豆包 Pro 256K', group: '豆包', provider: 'bytedance' },
      { id: 'doubao-pro-128k', name: '豆包 Pro 128K', group: '豆包', provider: 'bytedance' },
      { id: 'doubao-lite-128k', name: '豆包 Lite 128K', group: '豆包', provider: 'bytedance' },
    ],
  },
  // xAI (Grok)
  {
    type: 'openai',
    name: 'xAI',
    description: 'xAI Grok API',
    defaultBaseUrl: 'https://api.x.ai',
    logoUrl: '/model-icons/xai.svg',
    defaultModels: [
      { id: 'grok-4-0709', name: 'Grok 4', group: 'Grok', provider: 'xai', description: '实时数据接入，非正统风格' },
      { id: 'grok-4-reasoning', name: 'Grok 4 Reasoning', group: 'Grok', provider: 'xai', description: '增强推理版，专攻复杂逻辑和编码' },
    ],
  },
  // 阿里巴巴 Qwen
  {
    type: 'openai',
    name: '阿里巴巴 Qwen',
    description: '通义千问 Qwen API',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    logoUrl: '/model-icons/qwen-color.svg',
    defaultModels: [
      { id: 'qwen3-235b-a22b', name: 'Qwen3 235B-A22B', group: 'Qwen3', provider: 'qwen', description: 'MoE架构极致性能旗舰' },
      { id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B', group: 'Qwen3', provider: 'qwen', description: '超大规模代码专用模型' },
      { id: 'qwen3-vl', name: 'Qwen3 VL', group: 'Qwen3', provider: 'qwen', capabilities: { vision: true }, description: '视觉语言多模态模型' },
    ],
  },
  // Ollama (本地)
  {
    type: 'openai',
    name: 'Ollama',
    description: '本地 Ollama 服务',
    defaultBaseUrl: 'http://localhost:11434',
    logoUrl: '/model-icons/ollama.svg',
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