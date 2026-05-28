/**
 * Google (Gemini / Gemma) 系列模型前缀匹配规则
 *
 * 包括 Gemini 各版本分组、细分能力匹配、图像/TTS/Live 变体，以及 Gemma 系列。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const googleModelRules: ModelMetadataRule[] = [
  // === Gemini 版本分组 ===
  {
    id: "model-prefix-gemini-3",
    matchType: "modelPrefix",
    matchValue: "gemini-3",
    properties: {
      group: "Gemini 3",
      capabilities: {
        visionTokenCost: {
          calculationMethod: "gemini_2_0", // Gemini 3 沿用 2.0 的计算规则
          parameters: {},
        },
      },
    },
    priority: 22,
    enabled: true,
    description: "Gemini 3 系列模型分组",
  },
  {
    id: "model-prefix-gemini-3.5",
    matchType: "modelPrefix",
    matchValue: "gemini-3.5",
    properties: {
      group: "Gemini 3.5",
      capabilities: {
        visionTokenCost: {
          calculationMethod: "gemini_2_0", // Gemini 3.5 沿用 2.0 的计算规则
          parameters: {},
        },
      },
    },
    priority: 24,
    enabled: true,
    description:
      "Gemini 3.5 系列模型分组（3.5 Flash 已 GA，强 agentic & coding 能力，1M 上下文）",
  },
  {
    id: "model-prefix-gemini-3.1",
    matchType: "modelPrefix",
    matchValue: "gemini-3.1",
    properties: {
      group: "Gemini 3.1",
      capabilities: {
        visionTokenCost: {
          calculationMethod: "gemini_2_0", // Gemini 3.1 沿用 2.0 的计算规则
          parameters: {},
        },
      },
    },
    priority: 23,
    enabled: true,
    description:
      "Gemini 3.1 系列模型分组（3.1 Pro / 3.1 Flash / 3.1 Flash-Lite / 3.1 Flash Live / 3.1 Flash TTS）",
  },
  {
    id: "model-prefix-gemini-2.5",
    matchType: "modelPrefix",
    matchValue: "gemini-2.5",
    properties: {
      group: "Gemini 2.5",
      capabilities: {
        visionTokenCost: {
          calculationMethod: "gemini_2_0", // Gemini 2.5 沿用 2.0 的计算规则
          parameters: {},
        },
      },
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
      deprecated: true, // Google 官方已宣布 Gemini 2.0 系列废弃，即将关闭
      capabilities: {
        visionTokenCost: {
          calculationMethod: "gemini_2_0",
          parameters: {},
        },
      },
    },
    priority: 22,
    enabled: true,
    description:
      "Gemini 2.0 系列模型分组（已废弃，Gemini 2.0 Flash / Flash-Lite 即将关闭，请迁移至 2.5 系列）",
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

  // === Gemini 细分能力匹配（优先级 25-26） ===
  // Gemini 3/3.1/3.5 高级能力模型 (Thinking via thinkingLevel, Code Execution, Search)
  {
    id: "model-gemini-3x-advanced",
    matchType: "modelPrefix",
    matchValue: "gemini-3(?:\\.\\d+)?-(?:pro|flash)(?!.*(?:image|tts|live))",
    useRegex: true,
    properties: {
      capabilities: {
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high"],
        codeExecution: true,
        fileSearch: true,
        webSearch: true,
      },
      description:
        "Gemini 3/3.1/3.5 高级模型（支持思考等级 thinkingLevel、代码执行、联网搜索），覆盖 Gemini 3.x 的 Pro/Flash 变体",
    },
    priority: 25,
    enabled: true,
    description:
      "模型正则 gemini-3(?:\\.\\d+)?-(?:pro|flash)(?!.*(?:image|tts|live)) 元数据规则",
  },
  // Gemini 2.5 高级能力模型 (Thinking via thinkingBudget, Code Execution, Search)
  {
    id: "model-gemini-2.5-advanced",
    matchType: "modelPrefix",
    matchValue: "gemini-2\\.5-(?:pro|flash)(?!.*(?:image|tts|live))",
    useRegex: true,
    properties: {
      capabilities: {
        thinking: true,
        thinkingConfigType: "budget",
        codeExecution: true,
        fileSearch: true,
        webSearch: true,
      },
      description:
        "Gemini 2.5 高级模型（支持思考预算 thinkingBudget、代码执行、联网搜索），覆盖 Gemini 2.5 的 Pro/Flash 变体",
    },
    priority: 25,
    enabled: true,
    description:
      "模型正则 gemini-2\\.5-(?:pro|flash)(?!.*(?:image|tts|live)) 元数据规则",
  },
  // Gemini 2.0 Flash (Code Execution, Search)
  {
    id: "model-gemini-2.0-flash",
    matchType: "modelPrefix",
    matchValue: "gemini-2\\.0-flash(?!.*(?:image|live|lite))",
    useRegex: true,
    properties: {
      capabilities: {
        codeExecution: true,
        webSearch: true,
      },
      description: "Gemini 2.0 Flash（支持代码执行、联网搜索）",
    },
    priority: 25,
    enabled: true,
    description:
      "模型正则 gemini-2\\.0-flash(?!.*(?:image|live|lite)) 元数据规则",
  },
  // Gemini 图像生成模型（包括 Nano Banana 系列）
  {
    id: "model-gemini-image",
    matchType: "modelPrefix",
    matchValue: "gemini-.*image",
    useRegex: true,
    properties: {
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description: "Gemini 图像生成模型（支持迭代微调），包括 Nano Banana 系列",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 gemini-.*image 元数据规则",
  },
  // Gemini Live 实时对话模型（覆盖 2.5 和 3.x 系列）
  {
    id: "model-gemini-live",
    matchType: "modelPrefix",
    matchValue: "gemini-(?:2\\.5|3(?:\\.\\d+)?)-.*live",
    useRegex: true,
    properties: {
      capabilities: {
        thinking: true,
        webSearch: true,
      },
      description:
        "Gemini Live 实时对话模型（覆盖 2.5 Flash Live / 3.1 Flash Live，支持思考与联网搜索）",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 gemini-(?:2\\.5|3(?:\\.\\d+)?)-.*live 元数据规则",
  },
  // Gemini TTS 语音生成模型（覆盖 2.5 和 3.x 的 TTS 变体）
  {
    id: "model-gemini-tts",
    matchType: "modelPrefix",
    matchValue: "gemini-.*-tts",
    useRegex: true,
    properties: {
      capabilities: {
        audioGeneration: true,
      },
      description:
        "Gemini TTS 语音生成模型（覆盖 2.5 Flash TTS / 2.5 Pro TTS / 3.1 Flash TTS）",
    },
    priority: 26,
    enabled: true,
    description: "模型正则 gemini-.*-tts 元数据规则",
  },

  // === Gemini 基础配置 ===
  {
    id: "model-prefix-gemini",
    matchType: "modelPrefix",
    matchValue: "gemini-",
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini",
      tokenizer: "gemini", // Gemini 系列使用专用分词器
      capabilities: {
        vision: true,
        toolUse: true,
        document: true, // 支持 PDF 文档（inline_data 方式，最多 3600 页）
        jsonOutput: true,
        prefixCompletion: true, // Gemini 原生支持续写
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
    description:
      "Gemini 系列模型（基础配置：支持视觉、工具调用、文档处理和前缀续写）",
  },

  // === Gemma 系列 ===
  {
    id: "model-prefix-gemma3",
    matchType: "modelPrefix",
    matchValue: "gemma3",
    properties: {
      icon: `/model-icons/gemma-color.svg`,
      group: "Gemma",
      tokenizer: "gemini", // Gemma3 使用 gemini 分词器
      description: "Gemma 3 系列模型",
    },
    priority: 25, // 更高优先级以优先匹配 Gemma3
    enabled: true,
    description: "模型前缀 gemma3 元数据规则",
  },
  {
    id: "model-prefix-gemma",
    matchType: "modelPrefix",
    matchValue: "gemma-",
    properties: {
      icon: `/model-icons/gemma-color.svg`,
      group: "Gemma",
      tokenizer: "gemini", // Gemma 使用与 Gemini 相同的分词器
      description: "Gemma 系列模型",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 gemma- 元数据规则",
  },
];
