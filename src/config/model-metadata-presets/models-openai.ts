/**
 * OpenAI 系列模型前缀匹配规则
 *
 * 包括 GPT-4o、GPT-5、GPT-4.1、GPT-4、GPT-3.5、o1/o3/o4 推理系列、ChatGPT 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const openaiModelRules: ModelMetadataRule[] = [
  {
    id: "model-prefix-gpt-4o",
    matchType: "modelPrefix",
    matchValue: "gpt-4o",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        jsonOutput: true, // GPT-4o 支持 JSON 输出模式
        document: true, // 支持文档（通过 OpenAI Responses API 的 file_data/file_url/file_id）
        documentFormat: "openai_file", // 使用 OpenAI 的文件格式
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
      description:
        "GPT-4o 系列模型（使用 o200k_base 编码，支持视觉、工具调用和文档处理）",
    },
    priority: 25, // 更高优先级，优先匹配 gpt-4o
    enabled: true,
    description: "模型前缀 gpt-4o 元数据规则",
  },
  {
    id: "model-prefix-gpt-5.4",
    matchType: "modelPrefix",
    matchValue: "gpt-5.4",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-5.4 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        jsonOutput: true,
        document: true,
        documentFormat: "openai_file",
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
      description:
        "GPT-5.4 系列模型（最先进的智能模型，支持视觉、工具调用和文档处理）",
    },
    priority: 26, // 优先级高于 gpt-5
    enabled: true,
    description: "模型前缀 gpt-5.4 元数据规则",
  },
  {
    id: "model-prefix-gpt-5",
    matchType: "modelPrefix",
    matchValue: "gpt-5",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-5 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        jsonOutput: true,
        document: true,
        documentFormat: "openai_file",
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
      description:
        "GPT-5 系列模型（包括 mini/nano 等变体，支持视觉、工具调用和文档处理）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 gpt-5 元数据规则",
  },
  {
    id: "model-prefix-gpt-image",
    matchType: "modelPrefix",
    matchValue: "gpt-image",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 图像生成模型使用 o200k_base 编码
      description: "GPT Image 系列图像生成模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 gpt-image 元数据规则",
  },
  {
    id: "model-prefix-gpt-oss",
    matchType: "modelPrefix",
    matchValue: "gpt-oss",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-OSS 使用 gpt4o 分词器
      description: "GPT OSS 开源权重模型系列",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 gpt-oss 元数据规则",
  },
  {
    id: "model-prefix-gpt-audio",
    matchType: "modelPrefix",
    matchValue: "gpt-audio",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 音频模型使用 o200k_base 编码
      capabilities: {
        audio: true,
      },
      description: "GPT Audio 音频处理模型系列（包括 1.5 系列）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 gpt-audio 元数据规则",
  },
  {
    id: "model-prefix-gpt-realtime",
    matchType: "modelPrefix",
    matchValue: "gpt-realtime",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 实时模型使用 o200k_base 编码
      capabilities: {
        audio: true,
      },
      description: "GPT Realtime 实时模型系列（包括 1.5 系列）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 gpt-realtime 元数据规则",
  },
  {
    id: "model-prefix-gpt-4.1",
    matchType: "modelPrefix",
    matchValue: "gpt-4.1",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-4.1 使用 o200k_base 编码
      capabilities: {
        vision: true,
        toolUse: true,
        jsonOutput: true,
        document: true, // 支持文档（通过 OpenAI Responses API）
        documentFormat: "openai_file", // 使用 OpenAI 的文件格式
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
      description:
        "GPT-4.1 系列模型（最智能的非推理模型，支持视觉、工具调用和文档处理）",
    },
    priority: 25, // 更高优先级以优先匹配 gpt-4.1
    enabled: true,
    description: "模型前缀 gpt-4.1 元数据规则",
  },
  {
    id: "model-prefix-gpt-4",
    matchType: "modelPrefix",
    matchValue: "gpt-4",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4", // 使用 cl100k_base 编码
      capabilities: {
        vision: true, // GPT-4 Turbo 等支持视觉
        toolUse: true,
        jsonOutput: true,
        visionTokenCost: {
          calculationMethod: "openai_tile",
          parameters: {
            baseCost: 85,
            tileCost: 170,
            tileSize: 512,
          },
        },
      },
      description: "GPT-4 系列模型（使用 cl100k_base 编码）",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 gpt-4 元数据规则",
  },
  {
    id: "model-prefix-gpt-3.5",
    matchType: "modelPrefix",
    matchValue: "gpt-3.5",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4", // GPT-3.5-turbo 使用 cl100k_base 编码
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      description: "GPT-3.5 系列模型（使用 cl100k_base 编码）",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 gpt-3.5 元数据规则",
  },
  {
    id: "model-prefix-o1",
    matchType: "modelPrefix",
    matchValue: "o1",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // o1 系列使用 o200k_base 编码
      capabilities: {
        thinking: true,
        vision: true, // o1 支持视觉输入
        document: true, // 支持文档（通过 OpenAI Responses API）
        documentFormat: "openai_file", // 使用 OpenAI 的文件格式
        documentTokenCost: {
          calculationMethod: "dynamic", // OpenAI 根据页数和内容动态计算
        },
      },
      description:
        "o1 系列推理模型（使用 o200k_base 编码，支持推理、视觉和文档处理）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 o1 元数据规则",
  },
  {
    id: "model-prefix-o4-mini",
    matchType: "modelPrefix",
    matchValue: "o4-mini",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // o4-mini 使用 o200k_base 编码
      capabilities: {
        thinking: true,
      },
      description: "o4-mini 快速经济推理模型",
    },
    priority: 26, // 最高优先级以优先匹配 o4-mini
    enabled: true,
    description: "模型前缀 o4-mini 元数据规则",
  },
  {
    id: "model-prefix-deep-research",
    matchType: "modelPrefix",
    matchValue: ".*deep-research",
    useRegex: true,
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI Deep Research",
      capabilities: {
        thinking: true,
        webSearch: true,
      },
      description: "OpenAI Deep Research 系列模型（o3/o4-mini 等深度研究变体）",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 .*deep-research 元数据规则",
  },
  {
    id: "model-prefix-o3-pro",
    matchType: "modelPrefix",
    matchValue: "o3-pro",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
      capabilities: {
        thinking: true,
      },
      description: "o3-pro 带有更多计算的 o3 版本",
    },
    priority: 26,
    enabled: true,
    description: "模型前缀 o3-pro 元数据规则",
  },
  {
    id: "model-prefix-o3-mini",
    matchType: "modelPrefix",
    matchValue: "o3-mini",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
      capabilities: {
        thinking: true,
      },
      description: "o3-mini 小型推理模型",
    },
    priority: 26,
    enabled: true,
    description: "模型前缀 o3-mini 元数据规则",
  },
  {
    id: "model-prefix-o3",
    matchType: "modelPrefix",
    matchValue: "o3",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // o3 系列使用 o200k_base 编码
      capabilities: {
        thinking: true,
      },
      description: "o3 系列推理模型（使用 o200k_base 编码）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 o3 元数据规则",
  },
  {
    id: "model-prefix-chatgpt",
    matchType: "modelPrefix",
    matchValue: "chatgpt-",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // ChatGPT 系列使用 o200k_base 编码
      description: "ChatGPT 系列模型（使用 o200k_base 编码）",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 chatgpt- 元数据规则",
  },
  // 已废弃的 OpenAI 模型
  {
    id: "model-openai-deprecated-specific",
    matchType: "model",
    matchValue:
      "o1-mini|o1-preview|sora-2|sora-2-pro|gpt-4.5-preview|chatgpt-4o-latest|babbage-002|davinci-002|text-moderation-latest|text-moderation-stable",
    properties: {
      deprecated: true,
    },
    priority: 20,
    enabled: true,
    description: "标注已废弃的特定 OpenAI 模型",
  },
];
