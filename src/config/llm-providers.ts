/**
 * LLM 服务提供商类型配置
 */

import type { ProviderType, ProviderTypeInfo, LlmModelInfo } from "../types/llm-profiles";

/**
 * 支持的 LLM 服务提供商类型列表
 */
export const providerTypes: ProviderTypeInfo[] = [
  {
    type: "openai",
    name: "OpenAI-Compatible",
    description: "OpenAI 官方接口及所有兼容格式的服务（如 Ollama、DeepSeek 等）",
    defaultBaseUrl: "https://api.openai.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      frequencyPenalty: true,
      presencePenalty: true,
    },
  },
  {
    type: "openai-responses",
    name: "OpenAI Responses",
    description: "OpenAI Responses API - 新一代有状态交互接口，支持工具调用、推理等高级功能",
    defaultBaseUrl: "https://api.openai.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      frequencyPenalty: true,
      presencePenalty: true,
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
      topK: true,
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
      topK: true,
    },
  },
  {
    type: "cohere",
    name: "Cohere",
    description: "Cohere API (v2 格式)",
    defaultBaseUrl: "https://api.cohere.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      frequencyPenalty: true,
      presencePenalty: true,
    },
  },
  {
    type: "vertexai",
    name: "Vertex AI",
    description: "Google Cloud Vertex AI API",
    defaultBaseUrl: "https://us-central1-aiplatform.googleapis.com",
    supportsModelList: true,
    modelListEndpoint: "models",
    supportedParameters: {
      temperature: true,
      maxTokens: true,
      topP: true,
      topK: true,
    },
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
    type: "openai",
    name: "OpenAI",
    description: "OpenAI 官方服务",
    defaultBaseUrl: "https://api.openai.com",
    logoUrl: "/model-icons/openai.svg",
    defaultModels: [
      {
        id: "gpt-5",
        name: "GPT-5",
        group: "GPT-5",
        provider: "openai",
        capabilities: { vision: true, toolUse: true },
        description: "旗舰多模态模型，编码与代理任务王者",
      },
      {
        id: "gpt-5-pro",
        name: "GPT-5 Pro",
        group: "GPT-5",
        provider: "openai",
        capabilities: { vision: true, toolUse: true },
        description: "开发者专属，API增强版",
      },
      {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        group: "GPT-5",
        provider: "openai",
        description: "轻量高效，适合实时交互",
      },
      {
        id: "gpt-oss-120b",
        name: "GPT-OSS 120B",
        group: "GPT-OSS",
        provider: "openai",
        description: "开源变体，128K上下文",
      },
      {
        id: "o1-2024-12-17",
        name: "o1 (2024-12-17)",
        group: "o1",
        provider: "openai",
        capabilities: { toolUse: true },
        description: "推理优化模型",
      },
    ],
  },
  // OpenAI Responses API
  {
    type: "openai-responses",
    name: "OpenAI Responses",
    description: "OpenAI Responses API - 支持工具调用和推理的有状态交互",
    defaultBaseUrl: "https://api.openai.com",
    logoUrl: "/model-icons/openai.svg",
    defaultModels: [
      {
        id: "gpt-5.1",
        name: "GPT-5.1",
        group: "GPT-5",
        provider: "openai",
        capabilities: { vision: true, toolUse: true, webSearch: true },
        description: "支持文件/网络搜索等内置工具",
      },
      {
        id: "o3-mini",
        name: "o3-mini",
        group: "o3",
        provider: "openai",
        capabilities: { toolUse: true },
        description: "推理优化模型，支持可调节推理力度",
      },
      {
        id: "o1-2024-12-17",
        name: "o1 (2024-12-17)",
        group: "o1",
        provider: "openai",
        capabilities: { toolUse: true },
        description: "推理模型",
      },
      {
        id: "gpt-image-1-mini",
        name: "GPT Image 1 Mini",
        group: "GPT Image",
        provider: "openai",
        capabilities: { vision: true },
        description: "图像生成专属",
      },
    ],
  },
  // DeepSeek
  {
    type: "openai",
    name: "DeepSeek",
    description: "深度求索 API",
    defaultBaseUrl: "https://api.deepseek.com",
    logoUrl: "/model-icons/deepseek-color.svg",
    defaultModels: [
      {
        id: "deepseek-v3.2-exp",
        name: "DeepSeek V3.2 Exp",
        group: "DeepSeek V3",
        provider: "deepseek",
        description: "实验MoE，DSA稀疏注意力，成本降75%",
      },
      {
        id: "deepseek-r1-0528",
        name: "DeepSeek R1 0528",
        group: "DeepSeek R1",
        provider: "deepseek",
        description: "Dense推理旗舰，混合V3.1架构",
      },
      {
        id: "deepseek-chat",
        name: "DeepSeek V3.2 Chat",
        group: "DeepSeek V3",
        provider: "deepseek",
        description: "极致性价比 MoE 架构",
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek R1",
        group: "DeepSeek",
        provider: "deepseek",
        description: "推理专用模型",
      },
    ],
  },
  // Moonshot (月之暗面 Kimi)
  {
    type: "openai",
    name: "Moonshot",
    description: "月之暗面 Kimi API",
    defaultBaseUrl: "https://api.moonshot.cn",
    logoUrl: "/model-icons/moonshot.svg",
    defaultModels: [
      {
        id: "kimi-k2-instruct",
        name: "Kimi K2 Instruct",
        group: "Kimi K2",
        provider: "moonshot",
        description: "1T参数MoE，256K上下文，编码/代理顶级",
      },
      {
        id: "kimi-k2-turbo-preview",
        name: "Kimi K2 Turbo Preview",
        group: "Kimi K2",
        provider: "moonshot",
        description: "Turbo优化，50%折扣期内高效版",
      },
      {
        id: "kimi-k2-0905",
        name: "Kimi K2 0905",
        group: "Kimi K2",
        provider: "moonshot",
        description: "开源权重，高级编码/工具集成",
      },
      {
        id: "moonshot-v1-128k",
        name: "Moonshot V1 128K",
        group: "Moonshot V1",
        provider: "moonshot",
      },
      {
        id: "moonshot-v1-32k",
        name: "Moonshot V1 32K",
        group: "Moonshot V1",
        provider: "moonshot",
      },
    ],
  },
  // 智谱 AI
  {
    type: "openai",
    name: "智谱 AI",
    description: "智谱 GLM API",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    logoUrl: "/model-icons/zhipu-color.svg",
    defaultModels: [
      {
        id: "glm-4.6",
        name: "GLM-4.6",
        group: "GLM-4.6",
        provider: "zhipu",
        description: "200K上下文，SAA升级，编码/代理对标Claude",
      },
      {
        id: "glm-4.6-air",
        name: "GLM-4.6 Air",
        group: "GLM-4.6",
        provider: "zhipu",
        description: "高速Agent/高并发优化",
      },
      {
        id: "glm-4.6v",
        name: "GLM-4.6V",
        group: "GLM-4.6",
        provider: "zhipu",
        capabilities: { vision: true },
        description: "多模态视觉语言模型",
      },
      {
        id: "glm-4.5",
        name: "GLM-4.5",
        group: "GLM-4.5",
        provider: "zhipu",
        capabilities: { toolUse: true },
        description: "开源代理专用，推理/编码增强",
      },
      { id: "glm-4-plus", name: "GLM-4 Plus", group: "GLM-4", provider: "zhipu" },
      { id: "glm-4-flash", name: "GLM-4 Flash", group: "GLM-4", provider: "zhipu" },
    ],
  },
  // Groq
  {
    type: "openai",
    name: "Groq",
    description: "Groq 高速推理 API",
    defaultBaseUrl: "https://api.groq.com/openai",
    logoUrl: "/model-icons/groq.svg",
    defaultModels: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B Versatile",
        group: "Llama",
        provider: "groq",
        description: "多功能高速版",
      },
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        group: "Llama",
        provider: "groq",
        description: "即时响应，轻量首选",
      },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B 32K", group: "Mixtral", provider: "groq" },
      {
        id: "gemma-2-9b",
        name: "Gemma 2 9B",
        group: "Gemma",
        provider: "groq",
        description: "高效开源，价格性能比高",
      },
    ],
  },
  // Google Gemini
  {
    type: "gemini",
    name: "Google Gemini",
    description: "Google Gemini API",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    logoUrl: "/model-icons/gemini-color.svg",
    defaultModels: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        group: "Gemini 2.5",
        provider: "gemini",
        capabilities: { vision: true, toolUse: true },
        description: "复杂任务旗舰，内置思考/编码",
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        group: "Gemini 2.5",
        provider: "gemini",
        capabilities: { vision: true },
        description: "效率/低成本优化",
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash-Lite",
        group: "Gemini 2.5",
        provider: "gemini",
        capabilities: { vision: true },
        description: "端侧轻量版",
      },
      {
        id: "gemini-2.5-computer-use",
        name: "Gemini 2.5 Computer Use",
        group: "Gemini 2.5",
        provider: "gemini",
        capabilities: { vision: true, toolUse: true },
        description: "浏览器/移动任务，模拟用户操作",
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        group: "Gemini 1.5",
        provider: "gemini",
        capabilities: { vision: true },
      },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        group: "Gemini 1.5",
        provider: "gemini",
        capabilities: { vision: true },
      },
    ],
  },
  // Anthropic Claude
  {
    type: "claude",
    name: "Anthropic Claude",
    description: "Anthropic Claude API",
    defaultBaseUrl: "https://api.anthropic.com",
    logoUrl: "/model-icons/claude-color.svg",
    defaultModels: [
      {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        group: "Claude 4.5",
        provider: "anthropic",
        capabilities: { vision: true, toolUse: true },
        description: "编码/代理/计算机使用顶级，SWE-bench 77.2%",
      },
      {
        id: "claude-opus-4-1-20250805",
        name: "Claude Opus 4.1",
        group: "Claude 4",
        provider: "anthropic",
        capabilities: { vision: true },
        description: "旗舰推理模型",
      },
      {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        group: "Claude 3.7",
        provider: "anthropic",
        capabilities: { vision: true },
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        group: "Claude 3.5",
        provider: "anthropic",
        capabilities: { vision: true },
      },
    ],
  },
  // Cohere
  {
    type: "cohere",
    name: "Cohere",
    description: "Cohere API",
    defaultBaseUrl: "https://api.cohere.com",
    logoUrl: "/model-icons/cohere-color.svg",
    defaultModels: [
      {
        id: "command-a-reasoning",
        name: "Command A Reasoning",
        group: "Command A",
        provider: "cohere",
        capabilities: { toolUse: true },
        description: "企业推理/客服专用，256K上下文",
      },
      {
        id: "command-a-vision",
        name: "Command A Vision",
        group: "Command A",
        provider: "cohere",
        capabilities: { vision: true },
        description: "视觉任务，双GPU高效",
      },
      {
        id: "command-a-translate",
        name: "Command A Translate",
        group: "Command A",
        provider: "cohere",
        description: "多语言翻译，对标GPT-5",
      },
      { id: "command-r-plus", name: "Command R+", group: "Command", provider: "cohere" },
      { id: "command-r", name: "Command R", group: "Command", provider: "cohere" },
    ],
  },
  // Hugging Face (使用 OpenAI 兼容的 Chat Completion API)
  {
    type: "openai",
    name: "Hugging Face",
    description: "Hugging Face Chat Completion API (OpenAI 兼容)",
    defaultBaseUrl: "https://api-inference.huggingface.co",
    logoUrl: "/model-icons/huggingface-color.svg",
    defaultModels: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B Instruct",
        group: "Llama",
        provider: "huggingface",
      },
      {
        id: "meta-llama/Llama-3.1-8B-Instruct",
        name: "Llama 3.1 8B Instruct",
        group: "Llama",
        provider: "huggingface",
      },
      {
        id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        name: "Mixtral 8x7B Instruct",
        group: "Mixtral",
        provider: "huggingface",
      },
      {
        id: "microsoft/Phi-3-mini-4k-instruct",
        name: "Phi-3 Mini 4K",
        group: "Phi",
        provider: "huggingface",
      },
      {
        id: "Qwen/Qwen3-235B-A22B-Instruct",
        name: "Qwen3 235B Instruct",
        group: "Qwen3",
        provider: "huggingface",
        description: "MoE旗舰，开源热门",
      },
    ],
  },
  // Google Vertex AI
  {
    type: "vertexai",
    name: "Vertex AI",
    description: "Google Cloud Vertex AI",
    defaultBaseUrl: "https://us-central1-aiplatform.googleapis.com",
    logoUrl: "/model-icons/vertexai-color.svg",
    defaultModels: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        group: "Gemini 2.5",
        provider: "google",
        capabilities: { vision: true },
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        group: "Gemini 2.5",
        provider: "google",
        capabilities: { vision: true },
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        group: "Gemini 1.5",
        provider: "google",
        capabilities: { vision: true },
      },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        group: "Gemini 1.5",
        provider: "google",
        capabilities: { vision: true },
      },
    ],
  },
  // 火山引擎（字节跳动）
  {
    type: "openai",
    name: "火山引擎",
    description: "字节跳动火山引擎 API",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    logoUrl: "/model-icons/volcengine-color.svg",
    defaultModels: [
      {
        id: "doubao-1.6",
        name: "Doubao 1.6",
        group: "Doubao",
        provider: "bytedance",
        capabilities: { toolUse: true },
        description: "全功能综合模型，256K上下文，自适应推理",
      },
      {
        id: "doubao-1.5-pro",
        name: "Doubao 1.5 Pro",
        group: "Doubao",
        provider: "bytedance",
        capabilities: { vision: true },
        description: "多模态升级，资源高效",
      },
      { id: "doubao-pro-256k", name: "豆包 Pro 256K", group: "豆包", provider: "bytedance" },
      { id: "doubao-pro-128k", name: "豆包 Pro 128K", group: "豆包", provider: "bytedance" },
      { id: "doubao-lite-128k", name: "豆包 Lite 128K", group: "豆包", provider: "bytedance" },
    ],
  },
  // xAI (Grok)
  {
    type: "openai",
    name: "xAI",
    description: "xAI Grok API",
    defaultBaseUrl: "https://api.x.ai",
    logoUrl: "/model-icons/xai.svg",
    defaultModels: [
      {
        id: "grok-4",
        name: "Grok 4",
        group: "Grok 4",
        provider: "xai",
        capabilities: { toolUse: true, webSearch: true },
        description: "旗舰，非正统风格，实时数据接入",
      },
      {
        id: "grok-4-heavy",
        name: "Grok 4 Heavy",
        group: "Grok 4",
        provider: "xai",
        description: "重型变体，基准超群",
      },
      {
        id: "grok-4-reasoning",
        name: "Grok 4 Reasoning",
        group: "Grok",
        provider: "xai",
        description: "增强推理版，专攻复杂逻辑和编码",
      },
      {
        id: "imagine-v0.9",
        name: "Imagine v0.9",
        group: "Imagine",
        provider: "xai",
        capabilities: { vision: true },
        description: "图像生成，10月7日 rollout",
      },
    ],
  },
  // 阿里巴巴 Qwen
  {
    type: "openai",
    name: "阿里巴巴 Qwen",
    description: "通义千问 Qwen API",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
    logoUrl: "/model-icons/qwen-color.svg",
    defaultModels: [
      {
        id: "qwen3-max-preview",
        name: "Qwen3 Max Preview",
        group: "Qwen3",
        provider: "qwen",
        description: "1T+参数，最强文本模型",
      },
      {
        id: "qwen3-next-80b-a3b",
        name: "Qwen3 Next 80B A3B",
        group: "Qwen3",
        provider: "qwen",
        description: "高效MoE，消费级硬件友好",
      },
      {
        id: "qwen3-235b-a22b",
        name: "Qwen3 235B-A22B",
        group: "Qwen3",
        provider: "qwen",
        description: "MoE架构极致性能旗舰",
      },
      {
        id: "qwen3-coder-480b",
        name: "Qwen3 Coder 480B",
        group: "Qwen3",
        provider: "qwen",
        description: "超大规模代码专用模型",
      },
      {
        id: "qwen3-vl",
        name: "Qwen3 VL",
        group: "Qwen3",
        provider: "qwen",
        capabilities: { vision: true },
        description: "视觉语言多模态模型",
      },
      {
        id: "qwen3-asr-flash",
        name: "Qwen3 ASR Flash",
        group: "Qwen3",
        provider: "qwen",
        description: "语音转录专用，超竞品",
      },
    ],
  },
  // Ollama (本地)
  {
    type: "openai",
    name: "Ollama",
    description: "本地 Ollama 服务",
    defaultBaseUrl: "http://localhost:11434",
    logoUrl: "/model-icons/ollama.svg",
  },
];

/**
 * 根据类型获取提供商信息
 */
export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return providerTypes.find((p) => p.type === type);
}

/**
 * 根据名称获取预设模板
 */
export function getPresetByName(name: string): LlmPreset | undefined {
  return llmPresets.find((p) => p.name === name);
}
