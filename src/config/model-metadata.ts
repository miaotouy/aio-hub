/**
 * 模型元数据默认配置
 *
 * 这个文件定义了所有预设的模型元数据匹配规则。
 * 当前主要包含图标和分组信息，未来可以扩展更多属性。
 */

import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import { createModuleLogger } from "@utils/logger";
import { PRESET_ICONS_DIR } from "./preset-icons";

// 创建模块日志器
const logger = createModuleLogger("model-metadata");

// 从 preset-icons.ts 重新导出预设图标配置供外部使用
export { PRESET_ICONS_DIR, PRESET_ICONS } from "./preset-icons";

/**
 * 默认元数据规则配置
 *
 * 这个数组定义了所有预设的模型元数据匹配规则。
 * 当前主要包含图标和分组信息，未来可以扩展更多属性如能力、价格等。
 */
export const DEFAULT_METADATA_RULES: ModelMetadataRule[] = [
  // === Provider 级别匹配（优先级 10） ===
  // 主流国际 AI 服务商
  {
    id: "provider-openai",
    matchType: "provider",
    matchValue: "openai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 10,
    enabled: true,
    description: "OpenAI 提供商图标",
  },
  {
    id: "provider-openai-responses",
    matchType: "provider",
    matchValue: "openai-responses",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI Responses",
    },
    priority: 10,
    enabled: true,
    description: "OpenAI Responses 提供商图标",
  },
  {
    id: "provider-anthropic",
    matchType: "provider",
    matchValue: "anthropic",
    properties: {
      icon: `${PRESET_ICONS_DIR}/claude-color.svg`,
      group: "Claude",
    },
    priority: 10,
    enabled: true,
    description: "Anthropic (Claude) 提供商图标",
  },
  {
    id: "provider-google",
    matchType: "provider",
    matchValue: "google",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemini-color.svg`,
      group: "Gemini",
    },
    priority: 10,
    enabled: true,
    description: "Google 提供商图标",
  },
  {
    id: "provider-gemini",
    matchType: "provider",
    matchValue: "gemini",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemini-color.svg`,
      group: "Gemini",
    },
    priority: 10,
    enabled: true,
    description: "Google Gemini 提供商图标",
  },
  {
    id: "provider-cohere",
    matchType: "provider",
    matchValue: "cohere",
    properties: {
      icon: `${PRESET_ICONS_DIR}/cohere-color.svg`,
      group: "Cohere",
    },
    priority: 10,
    enabled: true,
    description: "Cohere 提供商图标",
  },
  {
    id: "provider-mistral",
    matchType: "provider",
    matchValue: "mistral",
    properties: {
      icon: `${PRESET_ICONS_DIR}/mistral-color.svg`,
      group: "Mistral",
    },
    priority: 10,
    enabled: true,
    description: "Mistral AI 提供商图标",
  },
  {
    id: "provider-meta",
    matchType: "provider",
    matchValue: "meta",
    properties: {
      icon: `${PRESET_ICONS_DIR}/meta-color.svg`,
      group: "Meta",
    },
    priority: 10,
    enabled: true,
    description: "Meta 提供商图标",
  },
  {
    id: "provider-microsoft",
    matchType: "provider",
    matchValue: "microsoft",
    properties: {
      icon: `${PRESET_ICONS_DIR}/microsoft-color.svg`,
      group: "Microsoft",
    },
    priority: 10,
    enabled: true,
    description: "Microsoft 提供商图标",
  },
  {
    id: "provider-xai",
    matchType: "provider",
    matchValue: "xai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/xai.svg`,
      group: "xAI",
    },
    priority: 10,
    enabled: true,
    description: "xAI 提供商图标",
  },
  {
    id: "provider-groq",
    matchType: "provider",
    matchValue: "groq",
    properties: {
      icon: `${PRESET_ICONS_DIR}/groq.svg`,
      group: "Groq",
    },
    priority: 10,
    enabled: true,
    description: "Groq 提供商图标",
  },
  {
    id: "provider-ai21",
    matchType: "provider",
    matchValue: "ai21",
    properties: {
      icon: `${PRESET_ICONS_DIR}/aionlabs-color.svg`,
      group: "AI21",
    },
    priority: 10,
    enabled: true,
    description: "AI21 Labs 提供商图标",
  },

  // 国内 AI 服务商
  {
    id: "provider-deepseek",
    matchType: "provider",
    matchValue: "deepseek",
    properties: {
      icon: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
      group: "DeepSeek",
    },
    priority: 10,
    enabled: true,
    description: "DeepSeek 提供商图标",
  },
  {
    id: "provider-moonshot",
    matchType: "provider",
    matchValue: "moonshot",
    properties: {
      icon: `${PRESET_ICONS_DIR}/kimi-color.svg`,
      group: "Kimi",
    },
    priority: 10,
    enabled: true,
    description: "Moonshot AI (Kimi) 提供商图标",
  },
  {
    id: "provider-zhipu",
    matchType: "provider",
    matchValue: "zhipu",
    properties: {
      icon: `${PRESET_ICONS_DIR}/zhipu-color.svg`,
      group: "Zhipu",
    },
    priority: 10,
    enabled: true,
    description: "智谱 AI 提供商图标",
  },
  {
    id: "provider-qwen",
    matchType: "provider",
    matchValue: "qwen",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
    },
    priority: 10,
    enabled: true,
    description: "通义千问提供商图标",
  },
  {
    id: "provider-bytedance",
    matchType: "provider",
    matchValue: "bytedance",
    properties: {
      icon: `${PRESET_ICONS_DIR}/bytedance-color.svg`,
      group: "ByteDance",
    },
    priority: 10,
    enabled: true,
    description: "字节跳动提供商图标",
  },
  {
    id: "provider-baidu",
    matchType: "provider",
    matchValue: "baidu",
    properties: {
      icon: `${PRESET_ICONS_DIR}/wenxin-color.svg`,
      group: "Baidu",
    },
    priority: 10,
    enabled: true,
    description: "百度提供商图标",
  },
  {
    id: "provider-tencent",
    matchType: "provider",
    matchValue: "tencent",
    properties: {
      icon: `${PRESET_ICONS_DIR}/hunyuan-color.svg`,
      group: "Tencent",
    },
    priority: 10,
    enabled: true,
    description: "腾讯提供商图标",
  },
  {
    id: "provider-minimax",
    matchType: "provider",
    matchValue: "minimax",
    properties: {
      icon: `${PRESET_ICONS_DIR}/minimax-color.svg`,
      group: "MiniMax",
    },
    priority: 10,
    enabled: true,
    description: "MiniMax 提供商图标",
  },
  {
    id: "provider-01ai",
    matchType: "provider",
    matchValue: "01ai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/yi-color.svg`,
      group: "Yi",
    },
    priority: 10,
    enabled: true,
    description: "零一万物提供商图标",
  },
  {
    id: "provider-baichuan",
    matchType: "provider",
    matchValue: "baichuan",
    properties: {
      icon: `${PRESET_ICONS_DIR}/baichuan-color.svg`,
      group: "Baichuan",
    },
    priority: 10,
    enabled: true,
    description: "百川提供商图标",
  },
  {
    id: "provider-sensenova",
    matchType: "provider",
    matchValue: "sensenova",
    properties: {
      icon: `${PRESET_ICONS_DIR}/sensenova-color.svg`,
      group: "SenseNova",
    },
    priority: 10,
    enabled: true,
    description: "商汤提供商图标",
  },
  {
    id: "provider-kwai",
    matchType: "provider",
    matchValue: "kwai-kolors",
    properties: {
      icon: `${PRESET_ICONS_DIR}/kolors-color.svg`,
      group: "Kwai",
    },
    priority: 10,
    enabled: true,
    description: "快手 Kolors 提供商图标",
  },
  {
    id: "provider-siliconflow",
    matchType: "provider",
    matchValue: "siliconflow",
    properties: {
      icon: `${PRESET_ICONS_DIR}/siliconcloud-color.svg`,
      group: "SiliconFlow",
    },
    priority: 10,
    enabled: true,
    description: "SiliconFlow 提供商图标",
  },
  {
    id: "provider-inclusionai",
    matchType: "provider",
    matchValue: "inclusionai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/ling.png`,
      group: "InclusionAI",
    },
    priority: 10,
    enabled: true,
    description: "蚂蚁集团旗下 Inclusion AI 提供商图标",
  },
  {
    id: "provider-wan-ai",
    matchType: "provider",
    matchValue: "wan-ai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
    },
    priority: 10,
    enabled: true,
    description: "千问万象 (Wan AI) 提供商图标",
  },
  {
    id: "provider-stepfun-ai",
    matchType: "provider",
    matchValue: "stepfun-ai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/stepfun-color.svg`,
      group: "StepFun",
    },
    priority: 10,
    enabled: true,
    description: "StepFun AI 提供商图标",
  },
  {
    id: "provider-teleai",
    matchType: "provider",
    matchValue: "teleai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/TeleAI.svg`,
      group: "TeleAI",
    },
    priority: 10,
    enabled: true,
    description: "TeleAI 提供商图标",
  },
  {
    id: "provider-ascend-tribe",
    matchType: "provider",
    matchValue: "ascend-tribe",
    properties: {
      icon: `${PRESET_ICONS_DIR}/ascend_tribe.png`,
      group: "Pangu",
    },
    priority: 10,
    enabled: true,
    description: "Ascend Tribe (Pangu) 提供商图标",
  },
  {
    id: "provider-fnlp",
    matchType: "provider",
    matchValue: "fnlp",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openmoss.svg`,
      group: "MOSS",
    },
    priority: 10,
    enabled: true,
    description: "MOSS (FNLP) 提供商图标",
  },
  {
    id: "provider-funaudiollm",
    matchType: "provider",
    matchValue: "funaudiollm",
    properties: {
      icon: `${PRESET_ICONS_DIR}/FunAudioLLM.png`,
      group: "FunAudioLLM",
    },
    priority: 10,
    enabled: true,
    description: "FunAudioLLM 提供商图标",
  },
  {
    id: "provider-indexteam",
    matchType: "provider",
    matchValue: "indexteam",
    properties: {
      icon: `${PRESET_ICONS_DIR}/IndexTeam.svg`,
      group: "IndexTeam",
    },
    priority: 10,
    enabled: true,
    description: "IndexTeam 提供商图标",
  },
  {
    id: "provider-netease-youdao",
    matchType: "provider",
    matchValue: "netease-youdao",
    properties: {
      icon: `${PRESET_ICONS_DIR}/netease-youdao.svg`,
      group: "Netease Youdao",
    },
    priority: 10,
    enabled: true,
    description: "网易有道提供商图标",
  },
  {
    id: "provider-fishaudio",
    matchType: "provider",
    matchValue: "fishaudio",
    properties: {
      icon: `${PRESET_ICONS_DIR}/fishaudio.svg`,
      group: "FishAudio",
    },
    priority: 10,
    enabled: true,
    description: "FishAudio 提供商图标",
  },

  // 其他服务商
  {
    id: "provider-huggingface",
    matchType: "provider",
    matchValue: "huggingface",
    properties: {
      icon: `${PRESET_ICONS_DIR}/huggingface-color.svg`,
      group: "HuggingFace",
    },
    priority: 10,
    enabled: true,
    description: "HuggingFace 提供商图标",
  },
  {
    id: "provider-z-ai",
    matchType: "provider",
    matchValue: "z-ai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/zai.svg`,
      group: "Z AI",
    },
    priority: 10,
    enabled: true,
    description: "Z AI 提供商图标",
  },
  {
    id: "provider-nebius",
    matchType: "provider",
    matchValue: "nebius",
    properties: {
      icon: `${PRESET_ICONS_DIR}/nebius.svg`,
      group: "Nebius",
    },
    priority: 10,
    enabled: true,
    description: "Nebius 提供商图标",
  },
  {
    id: "provider-stabilityai",
    matchType: "provider",
    matchValue: "stabilityai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/stability-color.svg`,
      group: "Stability AI",
    },
    priority: 10,
    enabled: true,
    description: "Stability AI 提供商图标",
  },
  {
    id: "provider-baai",
    matchType: "provider",
    matchValue: "baai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/baai.svg`,
      group: "BAAI",
    },
    priority: 10,
    enabled: true,
    description: "智源研究院 BAAI 提供商图标",
  },
  {
    id: "provider-black-forest-labs",
    matchType: "provider",
    matchValue: "black-forest-labs",
    properties: {
      icon: `${PRESET_ICONS_DIR}/flux.svg`,
      group: "Black Forest Labs",
    },
    priority: 10,
    enabled: true,
    description: "Black Forest Labs 提供商图标",
  },
  // API 服务商
  {
    id: "provider-openrouter",
    matchType: "provider",
    matchValue: "openrouter",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openrouter.svg`,
      group: "OpenRouter",
    },
    priority: 10,
    enabled: true,
    description: "OpenRouter 提供商图标",
  },

  // === Model Prefix 级别匹配（优先级 20） ===
  // OpenAI 系列模型
  {
    id: "model-prefix-gpt",
    matchType: "modelPrefix",
    matchValue: "gpt-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      capabilities: {
        vision: true, // GPT-4o, GPT-4 Turbo 等支持视觉
        toolUse: true, // 支持函数调用
      },
    },
    priority: 20,
    enabled: true,
    description: "GPT 系列模型图标",
  },
  {
    id: "model-prefix-o1",
    matchType: "modelPrefix",
    matchValue: "o1",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      capabilities: {
        reasoning: true, // o1 系列支持推理模式
      },
    },
    priority: 20,
    enabled: true,
    description: "o1 系列模型图标",
  },
  {
    id: "model-prefix-o3",
    matchType: "modelPrefix",
    matchValue: "o3",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      capabilities: {
        reasoning: true, // o3 系列支持推理模式
      },
    },
    priority: 20,
    enabled: true,
    description: "o3 系列模型图标",
  },
  {
    id: "model-prefix-chatgpt",
    matchType: "modelPrefix",
    matchValue: "chatgpt-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 20,
    enabled: true,
    description: "ChatGPT 系列模型图标",
  },

  // Anthropic 系列模型
  {
    id: "model-prefix-claude",
    matchType: "modelPrefix",
    matchValue: "claude-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/claude-color.svg`,
      group: "Claude",
      capabilities: {
        vision: true, // Claude 3+ 支持视觉
        thinking: true, // Claude 支持思考模式
        toolUse: true, // 支持工具调用
      },
    },
    priority: 20,
    enabled: true,
    description: "Claude 系列模型图标",
  },

  // Google 系列模型
  {
    id: "model-prefix-gemini",
    matchType: "modelPrefix",
    matchValue: "gemini-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemini-color.svg`,
      group: "Gemini",
      capabilities: {
        vision: true, // Gemini 支持视觉
        thinking: true, // Gemini 2.0+ 支持思考模式
        toolUse: true, // 支持函数调用
        codeExecution: true, // 支持代码执行
      },
    },
    priority: 20,
    enabled: true,
    description: "Gemini 系列模型图标",
  },
  {
    id: "model-prefix-gemma",
    matchType: "modelPrefix",
    matchValue: "gemma-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemma-color.svg`,
      group: "Gemma",
    },
    priority: 20,
    enabled: true,
    description: "Gemma 系列模型图标",
  },

  // DeepSeek 系列模型
  {
    id: "model-prefix-deepseek",
    matchType: "modelPrefix",
    matchValue: "deepseek-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
      group: "DeepSeek",
      capabilities: {
        reasoning: true, // DeepSeek 支持推理模式
      },
    },
    priority: 20,
    enabled: true,
    description: "DeepSeek 系列模型图标",
  },

  // 智谱 AI 系列模型
  {
    id: "model-prefix-glm",
    matchType: "modelPrefix",
    matchValue: "glm-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/chatglm-color.svg`,
      group: "Zhipu",
    },
    priority: 20,
    enabled: true,
    description: "GLM 系列模型图标",
  },
  {
    id: "model-prefix-chatglm",
    matchType: "modelPrefix",
    matchValue: "chatglm-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/chatglm-color.svg`,
      group: "Zhipu",
    },
    priority: 20,
    enabled: true,
    description: "ChatGLM 系列模型图标",
  },

  // Moonshot/Kimi 系列模型
  {
    id: "model-prefix-moonshot",
    matchType: "modelPrefix",
    matchValue: "moonshot-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/moonshot.svg`,
      group: "moonshot",
    },
    priority: 20,
    enabled: true,
    description: "Moonshot 系列模型图标",
  },
  {
    id: "model-prefix-kimi",
    matchType: "modelPrefix",
    matchValue: "kimi-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/kimi-color.svg`,
      group: "Kimi",
    },
    priority: 20,
    enabled: true,
    description: "Kimi 系列模型图标",
  },

  // 通义千问系列模型
  {
    id: "model-prefix-qwen",
    matchType: "modelPrefix",
    matchValue: "qwen",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
    },
    priority: 20,
    enabled: true,
    description: "通义千问系列模型图标",
  },
  {
    id: "model-prefix-qwq",
    matchType: "modelPrefix",
    matchValue: "qwq-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
    },
    priority: 20,
    enabled: true,
    description: "通义千问 QwQ 系列模型图标",
  },

  // 字节跳动豆包系列模型
  {
    id: "model-prefix-doubao",
    matchType: "modelPrefix",
    matchValue: "doubao-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/doubao-color.svg`,
      group: "ByteDance",
    },
    priority: 20,
    enabled: true,
    description: "豆包系列模型图标",
  },

  // 腾讯混元系列模型
  {
    id: "model-prefix-hunyuan",
    matchType: "modelPrefix",
    matchValue: "hunyuan-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/hunyuan-color.svg`,
      group: "Tencent",
    },
    priority: 20,
    enabled: true,
    description: "混元系列模型图标",
  },

  // 百度文心系列模型
  {
    id: "model-prefix-ernie",
    matchType: "modelPrefix",
    matchValue: "ernie-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/wenxin-color.svg`,
      group: "Baidu",
    },
    priority: 20,
    enabled: true,
    description: "ERNIE 系列模型图标",
  },

  // MiniMax 系列模型
  {
    id: "model-prefix-abab",
    matchType: "modelPrefix",
    matchValue: "abab",
    properties: {
      icon: `${PRESET_ICONS_DIR}/minimax-color.svg`,
      group: "MiniMax",
    },
    priority: 20,
    enabled: true,
    description: "MiniMax ABAB 系列模型图标",
  },
  {
    id: "model-prefix-minimax",
    matchType: "modelPrefix",
    matchValue: "minimax-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/minimax-color.svg`,
      group: "MiniMax",
    },
    priority: 20,
    enabled: true,
    description: "MiniMax 系列模型图标",
  },

  // 零一万物系列模型
  {
    id: "model-prefix-yi",
    matchType: "modelPrefix",
    matchValue: "yi-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/yi-color.svg`,
      group: "Yi",
    },
    priority: 20,
    enabled: true,
    description: "Yi 系列模型图标",
  },

  // 百川系列模型
  {
    id: "model-prefix-baichuan",
    matchType: "modelPrefix",
    matchValue: "baichuan",
    properties: {
      icon: `${PRESET_ICONS_DIR}/baichuan-color.svg`,
      group: "Baichuan",
    },
    priority: 20,
    enabled: true,
    description: "百川系列模型图标",
  },

  // InternLM 系列模型
  {
    id: "model-prefix-internlm",
    matchType: "modelPrefix",
    matchValue: "internlm",
    properties: {
      icon: `${PRESET_ICONS_DIR}/internlm-color.svg`,
      group: "InternLM",
    },
    priority: 20,
    enabled: true,
    description: "InternLM 系列模型图标",
  },

  // Skywork 系列模型
  {
    id: "model-prefix-skywork",
    matchType: "modelPrefix",
    matchValue: "skywork",
    properties: {
      icon: `${PRESET_ICONS_DIR}/skywork-color.svg`,
      group: "Skywork",
    },
    priority: 20,
    enabled: true,
    description: "Skywork 系列模型图标",
  },

  // RWKV 系列模型
  {
    id: "model-prefix-rwkv",
    matchType: "modelPrefix",
    matchValue: "rwkv",
    properties: {
      icon: `${PRESET_ICONS_DIR}/rwkv-color.svg`,
      group: "RWKV",
    },
    priority: 20,
    enabled: true,
    description: "RWKV 系列模型图标",
  },

  // xAI 系列模型
  {
    id: "model-prefix-grok",
    matchType: "modelPrefix",
    matchValue: "grok-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/grok.svg`,
      group: "xAI",
    },
    priority: 20,
    enabled: true,
    description: "Grok 系列模型图标",
  },
  {
    id: "model-prefix-imagine",
    matchType: "modelPrefix",
    matchValue: "imagine-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/xai.svg`,
      group: "xAI",
    },
    priority: 20,
    enabled: true,
    description: "xAI Imagine 系列模型图标",
  },

  // Meta 系列模型
  {
    id: "model-prefix-llama",
    matchType: "modelPrefix",
    matchValue: "(?<!o)llama[1-9-]",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/meta-color.svg`,
      group: "Meta",
    },
    priority: 20,
    enabled: true,
    description: "Llama 系列模型图标",
  },

  // Mistral 系列模型
  {
    id: "model-prefix-mistral",
    matchType: "modelPrefix",
    matchValue: "mistral-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/mistral-color.svg`,
      group: "Mistral",
    },
    priority: 20,
    enabled: true,
    description: "Mistral 系列模型图标",
  },
  {
    id: "model-prefix-mixtral",
    matchType: "modelPrefix",
    matchValue: "mixtral-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/mistral-color.svg`,
      group: "Mistral",
    },
    priority: 20,
    enabled: true,
    description: "Mixtral 系列模型图标",
  },

  // Cohere 系列模型
  {
    id: "model-prefix-command",
    matchType: "modelPrefix",
    matchValue: "command-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/cohere-color.svg`,
      group: "Cohere",
    },
    priority: 20,
    enabled: true,
    description: "Command 系列模型图标",
  },
  {
    id: "model-prefix-aya",
    matchType: "modelPrefix",
    matchValue: "aya-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/cohere-color.svg`,
      group: "Cohere",
    },
    priority: 20,
    enabled: true,
    description: "Aya 系列模型图标",
  },

  // AI21 系列模型
  {
    id: "model-prefix-jamba",
    matchType: "modelPrefix",
    matchValue: "jamba-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/aionlabs-color.svg`,
      group: "AI21",
    },
    priority: 20,
    enabled: true,
    description: "Jamba 系列模型图标",
  },

  // Microsoft 系列模型
  {
    id: "model-prefix-phi",
    matchType: "modelPrefix",
    matchValue: "phi-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/microsoft-color.svg`,
      group: "Microsoft",
    },
    priority: 20,
    enabled: true,
    description: "Phi 系列模型图标",
  },

  // Stability AI 系列模型
  {
    id: "model-prefix-stable-diffusion",
    matchType: "modelPrefix",
    matchValue: "stable-diffusion",
    properties: {
      icon: `${PRESET_ICONS_DIR}/stability-color.svg`,
      group: "Stability AI",
    },
    priority: 20,
    enabled: true,
    description: "Stable Diffusion 系列模型图标",
  },

  // BAAI 系列模型
  {
    id: "model-prefix-bge",
    matchType: "modelPrefix",
    matchValue: "bge-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/baai.svg`,
      group: "BAAI",
    },
    priority: 20,
    enabled: true,
    description: "BAAI BGE 系列模型图标",
  },

  // Black Forest Labs 系列模型
  {
    id: "model-prefix-flux",
    matchType: "modelPrefix",
    matchValue: "flux",
    properties: {
      icon: `${PRESET_ICONS_DIR}/flux.svg`,
      group: "Black Forest Labs",
    },
    priority: 20,
    enabled: true,
    description: "FLUX 系列模型图标",
  },

  // 快手 Kolors 系列模型
  {
    id: "model-prefix-kolors",
    matchType: "modelPrefix",
    matchValue: "kolors",
    properties: {
      icon: `${PRESET_ICONS_DIR}/kolors-color.svg`,
      group: "Kwai",
    },
    priority: 20,
    enabled: true,
    description: "Kolors 系列模型图标",
  },
  // Inclusion AI 系列模型
  {
    id: "model-prefix-inclusionai",
    matchType: "modelPrefix",
    matchValue: "inclusionai|ling",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/ling.png`,
      group: "InclusionAI",
    },
    priority: 20,
    enabled: true,
    description: "Inclusion AI (灵) 系列模型图标",
  },

  // 字节跳动 Seed 系列模型
  {
    id: "model-prefix-bytedance-seed",
    matchType: "modelPrefix",
    matchValue: "bytedance-seed|seed-",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/bytedance-color.svg`,
      group: "ByteDance",
    },
    priority: 20,
    enabled: true,
    description: "字节跳动 Seed 系列模型图标",
  },

  // 千问万象系列模型
  {
    id: "model-prefix-wan-ai",
    matchType: "modelPrefix",
    matchValue: "wan-ai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
    },
    priority: 20,
    enabled: true,
    description: "千问万象系列模型图标",
  },

  // StepFun 系列模型
  {
    id: "model-prefix-stepfun",
    matchType: "modelPrefix",
    matchValue: "stepfun",
    properties: {
      icon: `${PRESET_ICONS_DIR}/stepfun-color.svg`,
      group: "StepFun",
    },
    priority: 20,
    enabled: true,
    description: "StepFun 系列模型图标",
  },

  // 盘古系列模型
  {
    id: "model-prefix-pangu",
    matchType: "modelPrefix",
    matchValue: "pangu",
    properties: {
      icon: `${PRESET_ICONS_DIR}/ascend_tribe.png`,
      group: "Pangu",
    },
    priority: 20,
    enabled: true,
    description: "盘古系列模型图标",
  },

  // MOSS 系列模型
  {
    id: "model-prefix-moss",
    matchType: "modelPrefix",
    matchValue: "moss",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openmoss.svg`,
      group: "MOSS",
    },
    priority: 20,
    enabled: true,
    description: "MOSS 系列模型图标",
  },

  // FunAudioLLM 系列模型
  {
    id: "model-prefix-funaudiollm",
    matchType: "modelPrefix",
    matchValue: "cosyvoice|sensevoice",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/FunAudioLLM.png`,
      group: "FunAudioLLM",
    },
    priority: 20,
    enabled: true,
    description: "FunAudioLLM 系列模型图标",
  },

  // IndexTeam 系列模型
  {
    id: "model-prefix-indextts",
    matchType: "modelPrefix",
    matchValue: "indextts",
    properties: {
      icon: `${PRESET_ICONS_DIR}/IndexTeam.svg`,
      group: "IndexTeam",
    },
    priority: 20,
    enabled: true,
    description: "IndexTTS 系列模型图标",
  },

  // 网易有道 BCE 系列模型
  {
    id: "model-prefix-bce",
    matchType: "modelPrefix",
    matchValue: "bce-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/netease-youdao.svg`,
      group: "Netease Youdao",
    },
    priority: 20,
    enabled: true,
    description: "网易有道 BCE 系列模型图标",
  },

  // FishAudio 系列模型
  {
    id: "model-prefix-fish-speech",
    matchType: "modelPrefix",
    matchValue: "fish-speech",
    properties: {
      icon: `${PRESET_ICONS_DIR}/fishaudio.svg`,
      group: "FishAudio",
    },
    priority: 20,
    enabled: true,
    description: "FishAudio 系列模型图标",
  },

  // === 特定模型匹配（优先级 30） ===
  // OpenAI Sora 视频生成
  {
    id: "model-sora",
    matchType: "modelPrefix",
    matchValue: "sora",
    properties: {
      icon: `${PRESET_ICONS_DIR}/sora-color.svg`,
      group: "OpenAI",
    },
    priority: 30,
    enabled: true,
    description: "Sora 视频生成模型图标",
  },

  // 快手可灵视频生成
  {
    id: "model-kling",
    matchType: "modelPrefix",
    matchValue: "kling",
    properties: {
      icon: `${PRESET_ICONS_DIR}/kling-color.svg`,
      group: "Kwai",
    },
    priority: 30,
    enabled: true,
    description: "可灵视频生成模型图标",
  },

  // Suno 音乐生成
  {
    id: "model-suno",
    matchType: "modelPrefix",
    matchValue: "suno",
    properties: {
      icon: `${PRESET_ICONS_DIR}/suno.svg`,
      group: "Suno",
    },
    priority: 30,
    enabled: true,
    description: "Suno 音乐生成模型图标",
  },

  // Midjourney
  {
    id: "model-midjourney",
    matchType: "modelPrefix",
    matchValue: "midjourney|mj",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/midjourney.svg`,
      group: "Midjourney",
    },
    priority: 30,
    enabled: true,
    description: "Midjourney 系列模型图标",
  },
];

/**
 * 测试规则是否匹配模型
 * @param rule 规则对象
 * @param modelId 模型 ID
 * @param provider 提供商（可选）
 * @returns 是否匹配
 */
export function testRuleMatch(
  rule: ModelMetadataRule,
  modelId: string,
  provider?: string
): boolean {
  let matched = false;

  switch (rule.matchType) {
    case "model":
      if (rule.useRegex) {
        try {
          const regex = new RegExp(rule.matchValue, "i");
          matched = regex.test(modelId);
        } catch (e) {
          logger.warn("无效的正则表达式模式", {
            ruleId: rule.id,
            matchValue: rule.matchValue,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        matched = modelId === rule.matchValue;
      }
      break;

    case "modelPrefix":
      if (rule.useRegex) {
        try {
          const regex = new RegExp(rule.matchValue, "i");
          matched = regex.test(modelId);
        } catch (e) {
          logger.warn("无效的正则表达式模式", {
            ruleId: rule.id,
            matchValue: rule.matchValue,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        // 对整个模型 ID 进行不区分大小写的包含匹配，以兼容 user/model-name 格式
        matched = modelId.toLowerCase().includes(rule.matchValue.toLowerCase());
      }
      break;

    case "modelGroup":
      // modelGroup 已废弃，分组功能通过 properties.group 字段实现
      // 保留此 case 以兼容旧规则
      break;

    case "provider":
      if (provider && provider.toLowerCase() === rule.matchValue.toLowerCase()) {
        matched = true;
      }
      break;
  }

  return matched;
}

/**
 * 获取匹配模型的元数据属性
 * @param modelId 模型 ID
 * @param provider 提供商
 * @param rules 元数据规则列表（可选，默认使用内置规则）
 * @returns 匹配的元数据属性对象或 undefined
 */
export function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): ModelMetadataProperties | undefined {
  // 过滤启用的规则并按优先级排序
  const enabledRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of enabledRules) {
    if (testRuleMatch(rule, modelId, provider)) {
      return rule.properties;
    }
  }

  return undefined;
}

/**
 * 获取模型图标路径（向后兼容函数）
 * @param modelId 模型 ID
 * @param provider 提供商
 * @param rules 元数据规则列表（可选，默认使用内置规则）
 * @returns 图标路径或 undefined
 */
export function getModelIconPath(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): string | undefined {
  const properties = getMatchedModelProperties(modelId, provider, rules);
  return properties?.icon;
}

/**
 * 验证图标路径是否有效
 * @param iconPath 图标路径
 * @returns 是否有效
 */
export function isValidIconPath(iconPath: string): boolean {
  // 检查是否为有效的路径格式
  if (!iconPath || typeof iconPath !== "string") {
    return false;
  }

  // 支持的图片格式
  const validExtensions = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
  const hasValidExtension = validExtensions.some((ext) => iconPath.toLowerCase().endsWith(ext));

  return hasValidExtension;
}
