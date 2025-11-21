/**
 * 模型元数据默认配置
 *
 * 这个文件定义了所有预设的模型元数据匹配规则。
 * 当前主要包含图标和分组信息，未来可以扩展更多属性。
 */

import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import { createModuleLogger } from "@utils/logger";
import { merge } from "lodash-es";
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
  // === 能力自动匹配 (优先级 5) ===
  // 视觉能力
  {
    id: "capability-vision-vl",
    matchType: "modelPrefix",
    matchValue: "vl",
    properties: {
      capabilities: {
        vision: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含 'vl' 的模型自动添加视觉能力",
  },
  {
    id: "capability-vision-keywords",
    matchType: "modelPrefix",
    matchValue: "vision|visual|multimodal|vlm",
    useRegex: true,
    properties: {
      capabilities: {
        vision: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含视觉相关关键词的模型自动添加视觉能力",
  },

  // 工具调用能力
  {
    id: "capability-tool-use",
    matchType: "modelPrefix",
    matchValue: "tools?|function|fc",
    useRegex: true,
    properties: {
      capabilities: {
        toolUse: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含工具调用关键词的模型自动添加工具调用能力",
  },

  // 思考模式
  {
    id: "capability-thinking",
    matchType: "modelPrefix",
    matchValue: "think|extended-thinking",
    useRegex: true,
    properties: {
      capabilities: {
        thinking: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含思考关键词的模型自动添加思考模式能力",
  },

  // 推理能力
  {
    id: "capability-reasoning",
    matchType: "modelPrefix",
    matchValue: "reason|reasoning",
    useRegex: true,
    properties: {
      capabilities: {
        reasoning: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含推理关键词的模型自动添加推理能力",
  },

  // 代码执行
  {
    id: "capability-code-execution",
    matchType: "modelPrefix",
    matchValue: "code-execution|code-interpreter|execute",
    useRegex: true,
    properties: {
      capabilities: {
        codeExecution: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含代码执行关键词的模型自动添加代码执行能力",
  },

  // 联网搜索
  {
    id: "capability-web-search",
    matchType: "modelPrefix",
    matchValue: "search|web-search|grounded",
    useRegex: true,
    properties: {
      capabilities: {
        webSearch: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含搜索关键词的模型自动添加联网搜索能力",
  },

  // 文件搜索
  {
    id: "capability-file-search",
    matchType: "modelPrefix",
    matchValue: "file-search|retrieval",
    useRegex: true,
    properties: {
      capabilities: {
        fileSearch: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含文件搜索关键词的模型自动添加文件搜索能力",
  },

  // 计算机使用
  {
    id: "capability-computer-use",
    matchType: "modelPrefix",
    matchValue: "computer-use|browser-use",
    useRegex: true,
    properties: {
      capabilities: {
        computerUse: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含计算机使用关键词的模型自动添加计算机使用能力",
  },

  // 文档处理
  {
    id: "capability-document",
    matchType: "modelPrefix",
    matchValue: "doc|document|pdf",
    useRegex: true,
    properties: {
      capabilities: {
        document: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含文档处理关键词的模型自动添加文档处理能力",
  },

  // 图像生成
  {
    id: "capability-image-generation",
    matchType: "modelPrefix",
    matchValue: "image-gen|txt2img|dall-?e|diffusion|image",
    useRegex: true,
    properties: {
      capabilities: {
        imageGeneration: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含图像生成关键词的模型自动添加图像生成能力",
  },

  // 视频生成
  {
    id: "capability-video-generation",
    matchType: "modelPrefix",
    matchValue: "video-gen|txt2vid|sora|kling|video",
    useRegex: true,
    properties: {
      capabilities: {
        videoGeneration: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含视频生成关键词的模型自动添加视频生成能力",
  },

  // 音乐生成
  {
    id: "capability-music-generation",
    matchType: "modelPrefix",
    matchValue: "music-gen|audio-gen|suno",
    useRegex: true,
    properties: {
      capabilities: {
        musicGeneration: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含音乐生成关键词的模型自动添加音乐生成能力",
  },

  // 嵌入 (Embedding)
  {
    id: "capability-embedding",
    matchType: "modelPrefix",
    matchValue: "embed|embedding|bge",
    useRegex: true,
    properties: {
      capabilities: {
        embedding: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含嵌入关键词的模型自动添加嵌入能力",
  },

  // 重排 (Rerank)
  {
    id: "capability-rerank",
    matchType: "modelPrefix",
    matchValue: "rerank",
    properties: {
      capabilities: {
        rerank: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含重排关键词的模型自动添加重排能力",
  },

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
    matchValue: "kwai-kolors|kwaipilot",
    useRegex: true,
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
  {
    id: "model-prefix-nemotron",
    matchType: "modelPrefix",
    matchValue: "nemotron",
    properties: {
      icon: `${PRESET_ICONS_DIR}/nvidia-color.svg`,
      group: "NVIDIA",
    },
    priority: 20,
    enabled: true,
    description: "Nemotron 系列模型图标",
  },
  {
    id: "provider-nvidia",
    matchType: "provider",
    matchValue: "nvidia",
    properties: {
      icon: `${PRESET_ICONS_DIR}/nvidia-color.svg`,
      group: "NVIDIA",
    },
    priority: 10,
    enabled: true,
    description: "NVIDIA 提供商图标",
  },
  {
    id: "provider-meituan",
    matchType: "provider",
    matchValue: "meituan",
    properties: {
      icon: `${PRESET_ICONS_DIR}/meituan-color.svg`,
      group: "Meituan",
    },
    priority: 10,
    enabled: true,
    description: "美团提供商图标",
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

  // === Model Prefix 级别匹配（优先级 20-25） ===
  // OpenAI 系列模型 - 按优先级细分不同编码
  {
    id: "model-prefix-gpt-4o",
    matchType: "modelPrefix",
    matchValue: "gpt-4o",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        document: true, // 支持文档（通过 OpenAI Responses API 的 file_data/file_url/file_id）
        documentFormat: 'openai_file', // 使用 OpenAI 的文件格式
        visionTokenCost: {
          calculationMethod: "openai_tile",
          parameters: {
            baseCost: 85,
            tileCost: 170,
            tileSize: 512,
          },
        },
        documentTokenCost: {
          calculationMethod: "dynamic", // OpenAI 根据页数和内容动态计算
        },
      },
    },
    priority: 25, // 更高优先级，优先匹配 gpt-4o
    enabled: true,
    description: "GPT-4o 系列模型（使用 o200k_base 编码，支持视觉、工具调用和文档处理）",
  },
  {
    id: "model-prefix-gpt-5",
    matchType: "modelPrefix",
    matchValue: "gpt-5",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-5 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        document: true,
        documentFormat: 'openai_file',
        visionTokenCost: {
          calculationMethod: "openai_tile",
          parameters: {
            baseCost: 85,
            tileCost: 170,
            tileSize: 512,
          },
        },
        documentTokenCost: {
          calculationMethod: "dynamic",
        },
      },
    },
    priority: 25,
    enabled: true,
    description: "GPT-5 系列模型（使用 o200k_base 编码，支持视觉、工具调用和文档处理）",
  },
  {
    id: "model-prefix-gpt-image",
    matchType: "modelPrefix",
    matchValue: "gpt-image",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 图像生成模型使用 o200k_base 编码
    },
    priority: 25,
    enabled: true,
    description: "GPT Image 系列图像生成模型",
  },
  {
    id: "model-prefix-gpt-oss",
    matchType: "modelPrefix",
    matchValue: "gpt-oss",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-OSS 使用 gpt4o 分词器
    },
    priority: 25,
    enabled: true,
    description: "GPT OSS 开源权重模型系列",
  },
  {
    id: "model-prefix-gpt-audio",
    matchType: "modelPrefix",
    matchValue: "gpt-audio",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 音频模型使用 o200k_base 编码
    },
    priority: 25,
    enabled: true,
    description: "GPT Audio 音频处理模型系列",
  },
  {
    id: "model-prefix-gpt-realtime",
    matchType: "modelPrefix",
    matchValue: "gpt-realtime",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 实时模型使用 o200k_base 编码
    },
    priority: 25,
    enabled: true,
    description: "GPT Realtime 实时模型系列",
  },
  {
    id: "model-prefix-gpt-4.1",
    matchType: "modelPrefix",
    matchValue: "gpt-4.1",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-4.1 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        document: true, // 支持文档（通过 OpenAI Responses API）
        documentFormat: 'openai_file', // 使用 OpenAI 的文件格式
        visionTokenCost: {
          calculationMethod: "openai_tile",
          parameters: {
            baseCost: 85,
            tileCost: 170,
            tileSize: 512,
          },
        },
        documentTokenCost: {
          calculationMethod: "dynamic", // OpenAI 根据页数和内容动态计算
        },
      },
    },
    priority: 25, // 更高优先级以优先匹配 gpt-4.1
    enabled: true,
    description: "GPT-4.1 系列模型（最智能的非推理模型，支持视觉、工具调用和文档处理）",
  },
  {
    id: "model-prefix-gpt-4",
    matchType: "modelPrefix",
    matchValue: "gpt-4",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4", // 使用 cl100k_base 编码
      capabilities: {
        vision: true, // GPT-4 Turbo 等支持视觉
        toolUse: true,
        visionTokenCost: {
          calculationMethod: "openai_tile",
          parameters: {
            baseCost: 85,
            tileCost: 170,
            tileSize: 512,
          },
        },
      },
    },
    priority: 20,
    enabled: true,
    description: "GPT-4 系列模型（使用 cl100k_base 编码）",
  },
  {
    id: "model-prefix-gpt-3.5",
    matchType: "modelPrefix",
    matchValue: "gpt-3.5",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4", // GPT-3.5-turbo 使用 cl100k_base 编码
      capabilities: {
        toolUse: true,
      },
    },
    priority: 20,
    enabled: true,
    description: "GPT-3.5 系列模型（使用 cl100k_base 编码）",
  },
  {
    id: "model-prefix-o1",
    matchType: "modelPrefix",
    matchValue: "o1",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // o1 系列使用 o200k_base 编码
      capabilities: {
        reasoning: true,
        vision: true, // o1 支持视觉输入
        document: true, // 支持文档（通过 OpenAI Responses API）
        documentFormat: 'openai_file', // 使用 OpenAI 的文件格式
        documentTokenCost: {
          calculationMethod: "dynamic", // OpenAI 根据页数和内容动态计算
        },
      },
    },
    priority: 25,
    enabled: true,
    description: "o1 系列推理模型（使用 o200k_base 编码，支持推理、视觉和文档处理）",
  },
  {
    id: "model-prefix-o4-mini",
    matchType: "modelPrefix",
    matchValue: "o4-mini",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // o4-mini 使用 o200k_base 编码
      capabilities: {
        reasoning: true,
      },
    },
    priority: 26, // 最高优先级以优先匹配 o4-mini
    enabled: true,
    description: "o4-mini 快速经济推理模型",
  },
  {
    id: "model-prefix-o3-pro",
    matchType: "modelPrefix",
    matchValue: "o3-pro",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
      capabilities: {
        reasoning: true,
      },
    },
    priority: 26,
    enabled: true,
    description: "o3-pro 带有更多计算的 o3 版本",
  },
  {
    id: "model-prefix-o3-mini",
    matchType: "modelPrefix",
    matchValue: "o3-mini",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
      capabilities: {
        reasoning: true,
      },
    },
    priority: 26,
    enabled: true,
    description: "o3-mini 小型推理模型",
  },
  {
    id: "model-prefix-o3",
    matchType: "modelPrefix",
    matchValue: "o3",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // o3 系列使用 o200k_base 编码
      capabilities: {
        reasoning: true,
      },
    },
    priority: 25,
    enabled: true,
    description: "o3 系列推理模型（使用 o200k_base 编码）",
  },
  {
    id: "model-prefix-chatgpt",
    matchType: "modelPrefix",
    matchValue: "chatgpt-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // ChatGPT 系列使用 o200k_base 编码
    },
    priority: 20,
    enabled: true,
    description: "ChatGPT 系列模型（使用 o200k_base 编码）",
  },

  // Anthropic 系列模型
  {
    id: "model-prefix-claude",
    matchType: "modelPrefix",
    matchValue: "claude-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/claude-color.svg`,
      group: "Claude",
      tokenizer: "claude", // Claude 系列使用专用分词器
      capabilities: {
        vision: true,
        thinking: true,
        toolUse: true,
        document: true, // 支持 PDF 文档（通过 document 类型 + base64）
        visionTokenCost: {
          calculationMethod: "claude_3",
          parameters: {
            costPerImage: 1000, // 预估值，实际由 API 返回
          },
        },
        documentTokenCost: {
          calculationMethod: "dynamic", // Claude API 会返回实际 token 消耗
        },
      },
    },
    priority: 20,
    enabled: true,
    description: "Claude 系列模型（支持视觉、思考模式、工具调用和文档处理）",
  },

  // Google 系列模型
  {
    id: "model-prefix-gemini-3",
    matchType: "modelPrefix",
    matchValue: "gemini-3",
    properties: {
      group: "Gemini 3",
    },
    priority: 22,
    enabled: true,
    description: "Gemini 3 系列模型分组",
  },
  {
    id: "model-prefix-gemini-2.5",
    matchType: "modelPrefix",
    matchValue: "gemini-2.5",
    properties: {
      group: "Gemini 2.5",
    },
    priority: 22,
    enabled: true,
    description: "Gemini 2.5 系列模型分组",
  },
  {
    id: "model-prefix-gemini-2.0",
    matchType: "modelPrefix",
    matchValue: "gemini-2.0",
    properties: {
      group: "Gemini 2.0",
    },
    priority: 22,
    enabled: true,
    description: "Gemini 2.0 系列模型分组",
  },
  {
    id: "model-prefix-gemini-1.5",
    matchType: "modelPrefix",
    matchValue: "gemini-1.5",
    properties: {
      group: "Gemini 1.5",
    },
    priority: 22,
    enabled: true,
    description: "Gemini 1.5 系列模型分组",
  },
  {
    id: "model-prefix-gemini",
    matchType: "modelPrefix",
    matchValue: "gemini-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemini-color.svg`,
      group: "Gemini",
      tokenizer: "gemini", // Gemini 系列使用专用分词器
      capabilities: {
        vision: true,
        thinking: true,
        toolUse: true,
        codeExecution: true,
        document: true, // 支持 PDF 文档（inline_data 方式，最多 3600 页）
        visionTokenCost: {
          calculationMethod: "fixed",
          parameters: {
            costPerImage: 258, // Gemini 官方文档的预估值
          },
        },
        documentTokenCost: {
          calculationMethod: "per_page",
          tokensPerPage: 258, // Gemini 官方文档：每页 258 tokens
        },
      },
    },
    priority: 20,
    enabled: true,
    description: "Gemini 系列模型（支持视觉、思考模式、工具调用、代码执行和文档处理，最多 3600 页）",
  },
  {
    id: "model-prefix-gemma3",
    matchType: "modelPrefix",
    matchValue: "gemma3",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemma-color.svg`,
      group: "Gemma",
      tokenizer: "gemini", // Gemma3 使用 gemini 分词器
    },
    priority: 25, // 更高优先级以优先匹配 Gemma3
    enabled: true,
    description: "Gemma 3 系列模型",
  },
  {
    id: "model-prefix-gemma",
    matchType: "modelPrefix",
    matchValue: "gemma-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemma-color.svg`,
      group: "Gemma",
      tokenizer: "gemini", // Gemma 使用与 Gemini 相同的分词器
    },
    priority: 20,
    enabled: true,
    description: "Gemma 系列模型",
  },

  // DeepSeek 系列模型
  {
    id: "model-prefix-deepseek",
    matchType: "modelPrefix",
    matchValue: "deepseek-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
      group: "DeepSeek",
      tokenizer: "deepseek_v3", // DeepSeek 系列使用专用分词器
      capabilities: {
        reasoning: true,
      },
    },
    priority: 20,
    enabled: true,
    description: "DeepSeek 系列模型",
  },

  // 智谱 AI 系列模型
  {
    id: "model-prefix-glm",
    matchType: "modelPrefix",
    matchValue: "glm-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/chatglm-color.svg`,
      group: "Zhipu",
      tokenizer: "gpt4", // GLM 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // ChatGLM 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // Moonshot 使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // Kimi 使用类似 GPT-4 的分词器
    },
    priority: 20,
    enabled: true,
    description: "Kimi 系列模型图标",
  },

  // 通义千问系列模型
  {
    id: "model-prefix-qwen3",
    matchType: "modelPrefix",
    matchValue: "qwen3",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3", // Qwen3 使用最新分词器
    },
    priority: 25, // 更高优先级以优先匹配 Qwen3
    enabled: true,
    description: "通义千问 Qwen3 系列模型",
  },
  {
    id: "model-prefix-qwen",
    matchType: "modelPrefix",
    matchValue: "qwen",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3", // Qwen 系列使用 qwen3 分词器
    },
    priority: 20,
    enabled: true,
    description: "通义千问系列模型",
  },
  {
    id: "model-prefix-qwq",
    matchType: "modelPrefix",
    matchValue: "qwq-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3", // QwQ 使用 qwen3 分词器
    },
    priority: 20,
    enabled: true,
    description: "通义千问 QwQ 系列模型",
  },

  // 字节跳动豆包系列模型
  {
    id: "model-prefix-doubao",
    matchType: "modelPrefix",
    matchValue: "doubao-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/doubao-color.svg`,
      group: "ByteDance",
      tokenizer: "gpt4", // 豆包系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // 混元系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // ERNIE 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // ABAB 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // MiniMax 系列使用类似 GPT-4 的分词器
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
      tokenizer: "llama3_2", // Yi 系列基于 Llama 架构
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
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
      tokenizer: "llama3_2", // 百川系列基于 Llama 架构
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
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
      tokenizer: "llama3_2", // InternLM 系列基于 Llama 架构
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
    },
    priority: 20,
    enabled: true,
    description: "InternLM 系列模型图标",
  },

  // MiniCPM 系列模型
  {
    id: "model-prefix-minicpm",
    matchType: "modelPrefix",
    matchValue: "minicpm",
    properties: {
      icon: `${PRESET_ICONS_DIR}/minicpm-color.svg`,
      group: "MiniCPM",
      tokenizer: "llama3_2", // MiniCPM 使用 llama3_2 分词器
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
    },
    priority: 20,
    enabled: true,
    description: "MiniCPM 系列模型（面壁智能）",
  },

  // Skywork 系列模型
  {
    id: "model-prefix-skywork",
    matchType: "modelPrefix",
    matchValue: "skywork",
    properties: {
      icon: `${PRESET_ICONS_DIR}/skywork-color.svg`,
      group: "Skywork",
      tokenizer: "gpt4", // Skywork 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // RWKV 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // Grok 系列使用类似 GPT-4 的分词器
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
      tokenizer: "gpt4", // xAI Imagine 系列使用类似 GPT-4 的分词器
    },
    priority: 20,
    enabled: true,
    description: "xAI Imagine 系列模型图标",
  },

  // Meta 系列模型
  {
    id: "model-prefix-llama3_2",
    matchType: "modelPrefix",
    matchValue: "llama-?3[._-]?2",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2", // Llama 3.2 使用专用分词器
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
    },
    priority: 25, // 更高优先级以优先匹配 Llama 3.2
    enabled: true,
    description: "Llama 3.2 系列模型",
  },
  {
    id: "model-prefix-llama",
    matchType: "modelPrefix",
    matchValue: "(?<!o)llama[1-9-]",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2", // Llama 系列使用 llama3_2 分词器
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
    },
    priority: 20,
    enabled: true,
    description: "Llama 系列模型",
  },

  // Mistral 系列模型
  {
    id: "model-prefix-mistral",
    matchType: "modelPrefix",
    matchValue: "mistral-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/mistral-color.svg`,
      group: "Mistral",
      tokenizer: "llama3_2", // Mistral 系列基于 Llama 架构
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
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
      tokenizer: "llama3_2", // Mixtral 系列基于 Llama 架构
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
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
      tokenizer: "gpt4", // Command 系列使用类似 GPT-4 的分词器
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
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
      tokenizer: "gpt4", // Aya 系列使用类似 GPT-4 的分词器
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
      tokenizer: "llama3_2", // Jamba 系列基于混合架构，使用 llama3_2 分词器
      defaultPostProcessingRules: ["convert-system-to-user", "merge-consecutive-roles"],
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
      tokenizer: "gpt4", // Phi 系列使用类似 GPT-4 的分词器
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
    matchValue: "kolors|kat-coder",
    useRegex: true,
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

  // === 特定模型匹配（优先级 30+） ===
  // OpenAI 专用模型
  {
    id: "model-dall-e",
    matchType: "modelPrefix",
    matchValue: "dall-e",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 30,
    enabled: true,
    description: "DALL·E 图像生成模型",
  },
  {
    id: "model-whisper",
    matchType: "modelPrefix",
    matchValue: "whisper",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 30,
    enabled: true,
    description: "Whisper 语音识别模型",
  },
  {
    id: "model-tts",
    matchType: "modelPrefix",
    matchValue: "tts-",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 30,
    enabled: true,
    description: "TTS 文本转语音模型",
  },
  {
    id: "model-text-moderation",
    matchType: "modelPrefix",
    matchValue: "text-moderation|omni-moderation",
    useRegex: true,
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 30,
    enabled: true,
    description: "内容审核模型",
  },
  {
    id: "model-codex",
    matchType: "modelPrefix",
    matchValue: "codex",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
    },
    priority: 30,
    enabled: true,
    description: "Codex 代码模型系列",
  },
  {
    id: "model-babbage",
    matchType: "modelPrefix",
    matchValue: "babbage",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 10,
    enabled: true,
    description: "Babbage 系列模型（已弃用）",
  },
  {
    id: "model-davinci",
    matchType: "modelPrefix",
    matchValue: "davinci",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 10,
    enabled: true,
    description: "Davinci 系列模型（已弃用）",
  },

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
    description: "Sora 视频生成模型",
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
  // 1. 过滤启用的规则并按优先级排序
  const sortedEnabledRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // 2. 找出所有匹配的规则
  let matchedRules = sortedEnabledRules.filter((rule) => testRuleMatch(rule, modelId, provider));

  // 如果没有匹配的规则，直接返回
  if (matchedRules.length === 0) {
    return undefined;
  }

  // 3. 处理独占规则 (exclusive)
  // 找到优先级最高的独占规则
  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);

  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    // 只保留优先级大于等于独占规则的匹配项
    matchedRules = matchedRules.filter((r) => (r.priority || 0) >= exclusivePriority);
  }

  // 4. 按优先级从低到高合并属性
  // 需要反转数组，以便低优先级的先被合并
  const finalProperties = matchedRules
    .reverse()
    .reduce((acc, rule) => merge(acc, rule.properties), {} as ModelMetadataProperties);

  return finalProperties;
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
