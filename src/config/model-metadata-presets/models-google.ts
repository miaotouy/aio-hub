/**
 * Google (Gemini / Gemma) 系列模型前缀匹配规则
 *
 * 包括 Gemini 各版本分组、细分能力匹配、图像/TTS/Live 变体，以及 Gemma 系列。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const googleModelRules: ModelMetadataRule[] = [
  // === Gemini 当前具体模型信息（官方模型页/价格页，2026-05） ===
  {
    id: "model-gemini-3.5-flash",
    matchType: "model",
    matchValue: "gemini-3.5-flash",
    properties: {
      contextLength: 1048576,
      maxOutputTokens: 65536,
      pricing: {
        input: 1.5,
        output: 9.0,
        cacheHitInput: 0.15,
        unit: "USD",
        note: "每百万 token，标准计费；输出含 thinking tokens",
      },
      releaseDate: "2026-05",
      knowledgeCutoff: "2025-01",
      description:
        "Gemini 3.5 Flash 稳定版：面向 agentic workflow、复杂编码迭代和长程任务的高速前沿模型，1M 上下文，65K 输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-3.5-flash 元数据规则",
  },
  {
    id: "model-gemini-3.1-pro-preview",
    matchType: "model",
    matchValue:
      "^(?:gemini-3\\.1-pro-preview|gemini-3\\.1-pro-preview-customtools)$",
    useRegex: true,
    properties: {
      contextLength: 1048576,
      maxOutputTokens: 65536,
      pricing: {
        input: 2.0,
        output: 12.0,
        cacheHitInput: 0.2,
        unit: "USD",
        note: "每百万 token，标准计费；超过 200K prompt 时价格更高",
      },
      releaseDate: "2026-02",
      knowledgeCutoff: "2025-01",
      description:
        "Gemini 3.1 Pro Preview：改进 3 Pro 系列可靠性、token 效率、工具使用和多步 agentic workflow，1M 上下文，65K 输出",
    },
    priority: 36,
    enabled: true,
    description:
      "模型正则 gemini-3.1-pro-preview|gemini-3.1-pro-preview-customtools 元数据规则",
  },
  {
    id: "model-gemini-3.1-flash-lite",
    matchType: "model",
    matchValue: "gemini-3.1-flash-lite",
    properties: {
      contextLength: 1048576,
      maxOutputTokens: 65536,
      pricing: {
        input: 0.25,
        output: 1.5,
        cacheHitInput: 0.025,
        unit: "USD",
        note: "每百万 token，标准计费；文本/图像/视频输入价",
      },
      releaseDate: "2026-05",
      knowledgeCutoff: "2025-01",
      description:
        "Gemini 3.1 Flash-Lite 稳定版：低延迟、低成本多模态模型，适合高频轻量任务、翻译和简单数据处理，1M 上下文，65K 输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-3.1-flash-lite 元数据规则",
  },
  {
    id: "model-gemini-3.1-flash-image",
    matchType: "model",
    matchValue: "gemini-3.1-flash-image",
    properties: {
      contextLength: 65536,
      maxOutputTokens: 32768,
      pricing: {
        input: 0.5,
        output: 3.0,
        unit: "USD",
        note: "每百万 token，标准计费；图片输出 $60/百万 tokens",
      },
      releaseDate: "2026-05",
      description:
        "Gemini 3.1 Flash Image：高速交互式图像生成模型，支持 0.5K/1K/2K/4K 图片输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-3.1-flash-image 元数据规则",
  },
  {
    id: "model-gemini-3-pro-image",
    matchType: "model",
    matchValue:
      "^(?:gemini-3-pro-image(?:-preview)?|nano-banana-pro(?:-preview)?)$",
    useRegex: true,
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini",
      tokenizer: "gemini",
      contextLength: 65536,
      maxOutputTokens: 32768,
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
        thinking: true,
        thinkingConfigType: "switch",
        vision: true,
      },
      releaseDate: "2026-05",
      description:
        "Gemini 3 Pro Image / Nano Banana Pro：面向专业资产生产的图像生成模型，使用 Thinking 跟随复杂指令，支持高保真文字与 1K/2K/4K 输出",
      recommendedFor: [
        "专业图像生成",
        "图像编辑",
        "高保真文字渲染",
        "品牌资产",
      ],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 gemini-3-pro-image|nano-banana-pro 元数据规则",
  },
  {
    id: "model-gemini-3.1-flash-live-preview",
    matchType: "model",
    matchValue: "gemini-3.1-flash-live-preview",
    properties: {
      pricing: {
        input: 0.75,
        output: 4.5,
        unit: "USD",
        note: "每百万 token，标准计费；音频/图像/视频另有按 token 或分钟计费",
      },
      releaseDate: "2026-05",
      description:
        "Gemini 3.1 Flash Live Preview：低延迟 audio-to-audio 实时对话模型，支持声学细节、多模态感知和搜索 grounding",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-3.1-flash-live-preview 元数据规则",
  },
  {
    id: "model-gemini-3.1-flash-tts-preview",
    matchType: "model",
    matchValue: "gemini-3.1-flash-tts-preview",
    properties: {
      pricing: {
        input: 1.0,
        output: 20.0,
        unit: "USD",
        note: "每百万 token，标准计费；音频 token 按 25 tokens/秒折算",
      },
      releaseDate: "2026-05",
      description: "Gemini 3.1 Flash TTS Preview：低延迟、可控语音生成模型",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-3.1-flash-tts-preview 元数据规则",
  },
  {
    id: "model-gemini-2.5-pro",
    matchType: "model",
    matchValue: "gemini-2.5-pro",
    properties: {
      contextLength: 1048576,
      maxOutputTokens: 65536,
      releaseDate: "2025-06",
      knowledgeCutoff: "2025-01",
      description:
        "Gemini 2.5 Pro 稳定版：复杂推理、代码、数学、STEM、大型数据集和长文档分析模型，1M 上下文，65K 输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-2.5-pro 元数据规则",
  },
  {
    id: "model-gemini-2.5-flash",
    matchType: "model",
    matchValue: "gemini-2.5-flash",
    properties: {
      contextLength: 1048576,
      maxOutputTokens: 65536,
      releaseDate: "2025-06",
      knowledgeCutoff: "2025-01",
      description:
        "Gemini 2.5 Flash 稳定版：价格/性能均衡模型，适合低延迟、高吞吐、需要 thinking 的大规模 agentic 任务，1M 上下文，65K 输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-2.5-flash 元数据规则",
  },
  {
    id: "model-gemini-2.5-flash-lite",
    matchType: "model",
    matchValue: "gemini-2.5-flash-lite",
    properties: {
      contextLength: 1048576,
      maxOutputTokens: 65536,
      releaseDate: "2025-07",
      knowledgeCutoff: "2025-01",
      description:
        "Gemini 2.5 Flash-Lite 稳定版：最快、最省成本的 2.5 多模态模型，适合高频分类、简单抽取和低延迟场景，1M 上下文，65K 输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-2.5-flash-lite 元数据规则",
  },
  {
    id: "model-gemini-2.5-flash-image-details",
    matchType: "model",
    matchValue: "gemini-2.5-flash-image",
    properties: {
      contextLength: 65536,
      maxOutputTokens: 32768,
      releaseDate: "2025-10",
      knowledgeCutoff: "2025-06",
      description:
        "Gemini 2.5 Flash Image (Nano Banana) 稳定版：高速图像生成和对话式图像编辑模型，支持图文输入与图文输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-2.5-flash-image 元数据详情规则",
  },
  {
    id: "model-google-deprecated-specific",
    matchType: "model",
    matchValue:
      "^(?:gemini-3-(?:pro|flash)-preview|gemini-3-pro-image-preview|gemini-2\\.5-(?:pro|flash(?:-lite)?)-preview(?:-\\d{2}-\\d{4})?|gemini-2\\.5-flash-image-preview|gemini-1\\.5-(?:pro|flash).*)$",
    useRegex: true,
    properties: {
      deprecated: true,
    },
    priority: 36,
    enabled: true,
    description: "标注已废弃/已关闭的 Google Gemini 预览或 1.5 系列模型名",
  },
  {
    id: "model-gemini-embedding-2",
    matchType: "model",
    matchValue: "gemini-embedding-2",
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini Embedding",
      tokenizer: "gemini",
      contextLength: 8192,
      maxEmbeddingDimensions: 3072,
      recommendedEmbeddingDimensions: [768, 1536, 3072],
      capabilities: {
        embedding: true,
        vision: true,
        audio: true,
        video: true,
        document: true,
      },
      releaseDate: "2026-04",
      description:
        "Gemini Embedding 2：首个 Gemini 多模态嵌入模型，将文本、图像、视频、音频和 PDF 映射到统一向量空间，支持 128-3072 维可调输出",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-embedding-2 元数据规则",
  },
  {
    id: "model-gemini-embedding-001",
    matchType: "model",
    matchValue: "gemini-embedding-001",
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini Embedding",
      tokenizer: "gemini",
      contextLength: 2048,
      maxEmbeddingDimensions: 3072,
      capabilities: {
        embedding: true,
      },
      releaseDate: "2025-06",
      description:
        "Gemini Embedding 001：文本嵌入模型，支持 128-3072 维可调输出，适用于语义搜索、文档检索和推荐系统",
    },
    priority: 36,
    enabled: true,
    description: "模型 gemini-embedding-001 元数据规则",
  },
  {
    id: "model-google-embedding-deprecated",
    matchType: "model",
    matchValue:
      "^(?:text-embedding-004|embedding-001|embedding-gecko-001|gemini-embedding-exp(?:-03-07)?)$",
    useRegex: true,
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini Embedding",
      tokenizer: "gemini",
      deprecated: true,
      capabilities: {
        embedding: true,
      },
      description: "Google 旧版嵌入模型已废弃，请迁移到 gemini-embedding-001",
    },
    priority: 36,
    enabled: true,
    description: "标注已废弃的 Google 嵌入模型名",
  },

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
      "Gemini 3.5 系列模型分组（3.5 Flash 已 GA，强 agentic workflow、编码与长上下文能力，1M 上下文）",
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
      "Gemini 3.1 系列模型分组（3.1 Pro Preview / 3.1 Flash-Lite / 3.1 Flash Image / 3.1 Flash Live / 3.1 Flash TTS）",
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
    matchValue: "gemini-(?:2\\.5|3(?:\\.\\d+)?)-.*(?:live|native-audio)",
    useRegex: true,
    properties: {
      capabilities: {
        audio: true,
        video: true,
        thinking: true,
        webSearch: true,
      },
      description:
        "Gemini Live 实时对话模型（覆盖 2.5 Flash Native Audio / 3.1 Flash Live，支持音视频实时交互与联网搜索）",
    },
    priority: 25,
    enabled: true,
    description:
      "模型正则 gemini-(?:2\\.5|3(?:\\.\\d+)?)-.*(?:live|native-audio) 元数据规则",
  },
  // Gemini TTS 语音生成模型（覆盖 2.5 和 3.x 的 TTS 变体）
  {
    id: "model-gemini-tts",
    matchType: "modelPrefix",
    matchValue: "gemini-.*-tts",
    useRegex: true,
    properties: {
      capabilities: {
        audio: true,
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
        audio: true,
        video: true,
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
    id: "model-prefix-gemma4",
    matchType: "modelPrefix",
    matchValue: "gemma[-_]?4",
    useRegex: true,
    properties: {
      icon: `/model-icons/gemma-color.svg`,
      group: "Gemma 4",
      tokenizer: "gemini",
      contextLength: 131072,
      capabilities: {
        vision: true,
        video: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
        jsonOutput: true,
      },
      releaseDate: "2026-04",
      description:
        "Gemma 4 系列开放权重多模态模型，面向端侧和本地 agentic 应用，支持视觉、视频理解、工具调用和可选思考模式",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 gemma[-_]?4 元数据规则",
  },
  {
    id: "model-gemma4-large-context",
    matchType: "modelPrefix",
    matchValue: "gemma[-_]?4.*(?:12b|26b|31b)",
    useRegex: true,
    properties: {
      contextLength: 262144,
      description:
        "Gemma 4 大上下文模型，支持最高 256K token 上下文，适合长文档、代码库和多步 agentic 任务",
    },
    priority: 26,
    enabled: true,
    description: "模型正则 gemma[-_]?4.*(?:12b|26b|31b) 元数据规则",
  },
  {
    id: "model-gemma4-audio",
    matchType: "modelPrefix",
    matchValue: "gemma[-_]?4.*(?:e2b|e4b|12b)",
    useRegex: true,
    properties: {
      capabilities: {
        audio: true,
      },
    },
    priority: 26,
    enabled: true,
    description: "模型正则 gemma[-_]?4.*(?:e2b|e4b|12b) 音频能力规则",
  },
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
