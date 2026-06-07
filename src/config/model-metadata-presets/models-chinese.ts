/**
 * 国内其他模型前缀匹配规则
 *
 * 包括智谱 AI、Moonshot/Kimi、字节跳动、腾讯、百度、MiniMax、
 * 零一万物、百川、InternLM、MiniCPM、Skywork、RWKV 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const chineseModelRules: ModelMetadataRule[] = [
  // === 智谱 AI 系列模型 ===
  {
    id: "model-glm-4.6-family",
    matchType: "model",
    matchValue: "(?:^|/)GLM-4\\.6(?:-Air)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/zhipu-color.svg`,
      group: "Zhipu",
      tokenizer: "gpt4",
      contextLength: 200000,
      maxOutputTokens: 128000,
      pricing: {
        unit: "CNY",
        note: "不同渠道和 GLM-4.6 / Air 变体价格不同，以实际渠道为准",
      },
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
        jsonOutput: true,
      },
      features: {
        streaming: true,
        functionCalling: true,
      },
      releaseDate: "2025-10",
      description:
        "GLM-4.6 文本系列：智谱 GLM-4 家族旗舰/轻量变体，200K 上下文，面向编码、推理和 Agent 工具调用。",
      recommendedFor: ["代码生成", "Agent 工作流", "长上下文分析", "中文对话"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 GLM-4.6 / GLM-4.6-Air 元数据规则",
  },
  {
    id: "model-glm-4.6v-family",
    matchType: "model",
    matchValue: "(?:^|/)GLM-4\\.6V(?:-FlashX|-Flash)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/zhipu-color.svg`,
      group: "Zhipu",
      tokenizer: "gpt4",
      contextLength: 128000,
      capabilities: {
        vision: true,
        document: true,
        toolUse: true,
        jsonOutput: true,
      },
      features: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
      description:
        "GLM-4.6V 系列视觉理解模型，覆盖 GLM-4.6V、GLM-4.6V-FlashX 和 GLM-4.6V-Flash，128K 上下文，原生支持视觉 Function Call。",
      recommendedFor: ["图像理解", "多模态 Agent", "文档解析", "视觉工具调用"],
    },
    priority: 36,
    enabled: true,
    description:
      "模型正则 GLM-4.6V / GLM-4.6V-FlashX / GLM-4.6V-Flash 元数据规则",
  },
  {
    id: "model-glm-ocr",
    matchType: "modelPrefix",
    matchValue: "(?:^|/)glm-ocr(?:[:._-][\\w.-]+)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/zai.svg`,
      group: "Z AI",
      tokenizer: "gpt4",
      capabilities: {
        vision: true,
        document: true,
        jsonOutput: true,
      },
      features: {
        vision: true,
      },
      description:
        "GLM-OCR：Z.AI / 智谱面向文档和图像文字识别的视觉语言模型，兼容常见精度或渠道后缀。",
      recommendedFor: ["OCR", "文档解析", "表格识别", "票据识别"],
    },
    priority: 30,
    enabled: true,
    description: "模型正则 GLM-OCR 家族元数据规则",
  },
  {
    id: "model-prefix-glm",
    matchType: "modelPrefix",
    matchValue: "glm-",
    properties: {
      icon: `/model-icons/chatglm-color.svg`,
      group: "Zhipu",
      tokenizer: "gpt4",
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
      icon: `/model-icons/chatglm-color.svg`,
      group: "Zhipu",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "ChatGLM 系列模型图标",
  },

  // === Moonshot/Kimi 系列模型 ===
  {
    id: "model-prefix-moonshot",
    matchType: "modelPrefix",
    matchValue: "moonshot-",
    properties: {
      icon: `/model-icons/moonshot.svg`,
      group: "moonshot",
      tokenizer: "gpt4",
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
      icon: `/model-icons/kimi-color.svg`,
      group: "Kimi",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Kimi 系列模型图标",
  },

  // === 字节跳动豆包系列模型 ===
  {
    id: "model-prefix-doubao",
    matchType: "modelPrefix",
    matchValue: "doubao-",
    properties: {
      icon: `/model-icons/doubao-color.svg`,
      group: "ByteDance",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "豆包系列模型图标",
  },

  // === 腾讯混元系列模型 ===
  {
    id: "model-prefix-hunyuan",
    matchType: "modelPrefix",
    matchValue: "hunyuan-",
    properties: {
      icon: `/model-icons/hunyuan-color.svg`,
      group: "Tencent",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "混元系列模型图标",
  },

  // === 百度文心系列模型 ===
  {
    id: "model-prefix-ernie",
    matchType: "modelPrefix",
    matchValue: "ernie-",
    properties: {
      icon: `/model-icons/wenxin-color.svg`,
      group: "Baidu",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "ERNIE 系列模型图标",
  },

  // === MiniMax 系列模型 ===
  {
    id: "model-minimax-m3",
    matchType: "model",
    matchValue: "(?:^|/)MiniMax-M3$",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      tokenizer: "gpt4",
      contextLength: 1000000,
      capabilities: {
        thinking: true,
        thinkingConfigType: "switch",
        vision: true,
        toolUse: true,
        jsonOutput: true,
      },
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description:
        "MiniMax-M3：MiniMax 最新 M 系列语言模型，原生多模态、1M 上下文，面向 Agent 推理、工具调用、代码和长上下文任务。",
      recommendedFor: [
        "Agent 工作流",
        "代码生成",
        "长上下文分析",
        "多模态任务",
      ],
    },
    priority: 37,
    enabled: true,
    description: "模型正则 MiniMax-M3 元数据规则",
  },
  {
    id: "model-minimax-m2-family",
    matchType: "model",
    matchValue:
      "(?:^|/)MiniMax-M(?:2\\.7(?:-highspeed)?|2\\.5(?:-highspeed)?)$",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      tokenizer: "gpt4",
      contextLength: 204800,
      capabilities: {
        thinking: true,
        thinkingConfigType: "switch",
        toolUse: true,
        jsonOutput: true,
      },
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description:
        "MiniMax-M2.7 / M2.5 系列语言模型，覆盖 highspeed 极速版，204.8K 上下文，适合 Agent、代码和长文档任务。",
      recommendedFor: ["Agent 工作流", "代码生成", "长文档分析", "高吞吐对话"],
    },
    priority: 36,
    enabled: true,
    description:
      "模型正则 MiniMax-M2.7 / M2.7-highspeed / M2.5 / M2.5-highspeed 元数据规则",
  },
  {
    id: "model-minimax-m2-legacy-family",
    matchType: "model",
    matchValue: "(?:^|/)MiniMax-M(?:2\\.1(?:-highspeed)?|2)$",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      tokenizer: "gpt4",
      capabilities: {
        thinking: true,
        thinkingConfigType: "switch",
        toolUse: true,
        jsonOutput: true,
      },
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description:
        "MiniMax-M2.1 / M2 历史语言模型，覆盖 highspeed 极速版，适合代码、Agent 和多轮对话任务。",
      recommendedFor: ["代码生成", "Agent 工作流", "中文对话", "历史模型兼容"],
    },
    priority: 35,
    enabled: true,
    description: "模型正则 MiniMax-M2.1 / M2.1-highspeed / M2 元数据规则",
  },
  {
    id: "model-minimax-hailuo-2-family",
    matchType: "model",
    matchValue: "(?:^|/)MiniMax[-_ ]Hailuo[-_ ](?:2\\.3(?:[-_ ]Fast)?|02)$",
    useRegex: true,
    properties: {
      icon: `/model-icons/hailuo-color.svg`,
      group: "MiniMax",
      capabilities: {
        videoGeneration: true,
        vision: true,
      },
      features: {
        vision: true,
      },
      description:
        "MiniMax Hailuo 2 系列视频生成模型，覆盖 Hailuo 2.3、2.3 Fast 和 Hailuo 02 历史模型。",
      recommendedFor: ["文生视频", "图生视频", "短片生成", "创意视频"],
    },
    priority: 35,
    enabled: true,
    description: "模型正则 MiniMax Hailuo 2.3 / 2.3 Fast / 02 元数据规则",
  },
  {
    id: "model-minimax-speech-family",
    matchType: "model",
    matchValue: "(?:^|/)Speech-(?:2\\.8|2\\.6|02)-(?:HD|Turbo)$",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      capabilities: {
        audioGeneration: true,
      },
      features: {
        audio: true,
      },
      description:
        "MiniMax Speech 系列语音生成模型，覆盖 2.8、2.6 和 02 的 HD / Turbo 变体。",
      recommendedFor: ["语音合成", "配音", "情绪语音", "低延迟 TTS"],
    },
    priority: 35,
    enabled: true,
    description: "模型正则 MiniMax Speech HD / Turbo 元数据规则",
  },
  {
    id: "model-minimax-image-01-family",
    matchType: "model",
    matchValue: "(?:^|/)image-01(?:-live)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      features: {
        vision: true,
      },
      description:
        "MiniMax image-01 系列图像生成模型，覆盖 image-01 和 image-01-live，支持文生图和图生图场景。",
      recommendedFor: ["图像生成", "图生图", "卡通风格", "插画创作"],
    },
    priority: 35,
    enabled: true,
    description: "模型正则 MiniMax image-01 / image-01-live 元数据规则",
  },
  {
    id: "model-minimax-music-family",
    matchType: "model",
    matchValue: "(?:^|/)music-(?:2\\.6|cover)(?:-free)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      capabilities: {
        musicGeneration: true,
        audio: true,
      },
      features: {
        audio: true,
      },
      description:
        "MiniMax music 系列音乐生成模型，覆盖 music-2.6、music-cover 及其 free 变体。",
      recommendedFor: ["音乐生成", "翻唱生成", "歌词创作", "风格迁移"],
    },
    priority: 35,
    enabled: true,
    description:
      "模型正则 MiniMax music-2.6 / music-cover / free 变体元数据规则",
  },
  {
    id: "model-prefix-minimax-m-family",
    matchType: "modelPrefix",
    matchValue: "MiniMax[-/]?M(?:1|2(?:\\.\\d+)?|3)(?:-[\\w.-]+)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      tokenizer: "gpt4",
      capabilities: {
        thinking: true,
        toolUse: true,
      },
      description:
        "MiniMax M 系列长上下文推理模型，覆盖 MiniMax-M1、MiniMax-M2/M2.x 和 MiniMax-M3 变体。",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 MiniMax M 系列元数据规则",
  },
  {
    id: "model-prefix-abab",
    matchType: "modelPrefix",
    matchValue: "abab",
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      tokenizer: "gpt4",
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
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "MiniMax 系列模型图标",
  },
  {
    id: "model-prefix-minimax-m2",
    matchType: "modelPrefix",
    matchValue: "minimax-m2",
    properties: {
      icon: `/model-icons/minimax-color.svg`,
      group: "MiniMax",
      description: "MiniMax M2 系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 minimax-m2 元数据规则",
  },

  // === 零一万物系列模型 ===
  {
    id: "model-prefix-yi",
    matchType: "modelPrefix",
    matchValue: "yi-",
    properties: {
      icon: `/model-icons/yi-color.svg`,
      group: "Yi",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Yi 系列模型图标",
  },

  // === 百川系列模型 ===
  {
    id: "model-prefix-baichuan",
    matchType: "modelPrefix",
    matchValue: "baichuan",
    properties: {
      icon: `/model-icons/baichuan-color.svg`,
      group: "Baichuan",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "百川系列模型图标",
  },

  // === InternLM 系列模型 ===
  {
    id: "model-prefix-internlm",
    matchType: "modelPrefix",
    matchValue: "internlm",
    properties: {
      icon: `/model-icons/internlm-color.svg`,
      group: "InternLM",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "InternLM 系列模型图标",
  },

  // === MiniCPM 系列模型 ===
  {
    id: "model-prefix-minicpm",
    matchType: "modelPrefix",
    matchValue: "minicpm",
    properties: {
      group: "MiniCPM",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description: "MiniCPM 系列模型（面壁智能）",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 minicpm 元数据规则",
  },

  // === Skywork 系列模型 ===
  {
    id: "model-prefix-skywork",
    matchType: "modelPrefix",
    matchValue: "skywork",
    properties: {
      icon: `/model-icons/skywork-color.svg`,
      group: "Skywork",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Skywork 系列模型图标",
  },

  // === RWKV 系列模型 ===
  {
    id: "model-prefix-rwkv",
    matchType: "modelPrefix",
    matchValue: "rwkv",
    properties: {
      icon: `/model-icons/rwkv-color.svg`,
      group: "RWKV",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "RWKV 系列模型图标",
  },

  // === 字节跳动 Seed 系列模型 ===
  {
    id: "model-prefix-bytedance-seed",
    matchType: "modelPrefix",
    matchValue: "bytedance-seed|seed-",
    useRegex: true,
    properties: {
      icon: `/model-icons/bytedance-color.svg`,
      group: "ByteDance",
    },
    priority: 20,
    enabled: true,
    description: "字节跳动 Seed 系列模型图标",
  },
  {
    id: "model-prefix-hunter-alpha",
    matchType: "modelPrefix",
    matchValue: "hunter-alpha",
    properties: {
      icon: `/model-icons/bytedance-color.svg`,
      group: "ByteDance",
      description: "Hunter Alpha 模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 hunter-alpha 元数据规则",
  },

  // === StepFun 系列模型 ===
  {
    id: "model-prefix-stepfun",
    matchType: "modelPrefix",
    matchValue: "stepfun",
    properties: {
      icon: `/model-icons/stepfun-color.svg`,
      group: "StepFun",
    },
    priority: 20,
    enabled: true,
    description: "StepFun 系列模型图标",
  },

  // === 昆仑万维 SkyReels ===
  {
    id: "model-prefix-skyreels",
    matchType: "modelPrefix",
    matchValue: "skyreels",
    properties: {
      icon: `/model-icons/skyreels.svg`,
      group: "Kunlun",
      capabilities: {
        videoGeneration: true,
      },
      description: "昆仑万维 SkyReels 视频生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 skyreels 元数据规则",
  },

  // === 生数科技 Vidu ===
  {
    id: "model-prefix-vidu",
    matchType: "modelPrefix",
    matchValue: "vidu",
    properties: {
      icon: `/model-icons/vidu.svg`,
      group: "ShengShu",
      capabilities: {
        videoGeneration: true,
      },
      description: "生数科技 Vidu 视频生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 vidu 元数据规则",
  },

  // === 小米 MiMo ===
  {
    id: "model-prefix-mimo",
    matchType: "modelPrefix",
    matchValue: "mimo",
    properties: {
      icon: `/model-icons/xiaomimimo.svg`,
      group: "Xiaomi",
      description: "小米 MiMo 系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 mimo 元数据规则",
  },

  // === 盘古系列模型 ===
  {
    id: "model-prefix-pangu",
    matchType: "modelPrefix",
    matchValue: "pangu",
    properties: {
      icon: `/model-icons/ascend_tribe.png`,
      group: "Pangu",
    },
    priority: 20,
    enabled: true,
    description: "盘古系列模型图标",
  },

  // === MOSS 系列模型 ===
  {
    id: "model-prefix-moss",
    matchType: "modelPrefix",
    matchValue: "moss",
    properties: {
      icon: `/model-icons/openmoss.svg`,
      group: "MOSS",
    },
    priority: 20,
    enabled: true,
    description: "MOSS 系列模型图标",
  },

  // === FunAudioLLM 系列模型 ===
  {
    id: "model-prefix-funaudiollm",
    matchType: "modelPrefix",
    matchValue: "cosyvoice|sensevoice",
    useRegex: true,
    properties: {
      icon: `/model-icons/FunAudioLLM.png`,
      group: "FunAudioLLM",
    },
    priority: 20,
    enabled: true,
    description: "FunAudioLLM 系列模型图标",
  },

  // === IndexTeam 系列模型 ===
  {
    id: "model-prefix-indextts",
    matchType: "modelPrefix",
    matchValue: "indextts",
    properties: {
      icon: `/model-icons/IndexTeam.svg`,
      group: "IndexTeam",
    },
    priority: 20,
    enabled: true,
    description: "IndexTTS 系列模型图标",
  },

  // === 网易有道 BCE 系列模型 ===
  {
    id: "model-prefix-bce",
    matchType: "modelPrefix",
    matchValue: "bce-",
    properties: {
      icon: `/model-icons/netease-youdao.svg`,
      group: "Netease Youdao",
    },
    priority: 20,
    enabled: true,
    description: "网易有道 BCE 系列模型图标",
  },

  // === FishAudio 系列模型 ===
  {
    id: "model-prefix-fish-speech",
    matchType: "modelPrefix",
    matchValue: "fish-speech",
    properties: {
      icon: `/model-icons/fishaudio.svg`,
      group: "FishAudio",
    },
    priority: 20,
    enabled: true,
    description: "FishAudio 系列模型图标",
  },

  // === 快手 Kolors 系列模型 ===
  {
    id: "model-prefix-kolors",
    matchType: "modelPrefix",
    matchValue: "kolors|kat-coder",
    useRegex: true,
    properties: {
      icon: `/model-icons/kolors-color.svg`,
      group: "Kwai",
    },
    priority: 20,
    enabled: true,
    description: "Kolors 系列模型图标",
  },

  // === Inclusion AI 系列模型 ===
  {
    id: "model-prefix-inclusionai",
    matchType: "modelPrefix",
    matchValue: "inclusionai|ling|elephant",
    useRegex: true,
    properties: {
      icon: `/model-icons/ling.png`,
      group: "InclusionAI",
    },
    priority: 20,
    enabled: true,
    description: "Inclusion AI (灵) 系列模型图标",
  },

  // === Agnes AI (Sapiens AI) 系列模型 ===
  {
    id: "model-agnes-2.0-flash",
    matchType: "model",
    matchValue: "agnes-2.0-flash",
    properties: {
      icon: `/model-icons/agnes.png`,
      group: "Agnes AI",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 65500,
      pricing: {
        input: 0.1,
        output: 0.2,
        unit: "USD",
        note: "每百万 token",
      },
      capabilities: {
        thinking: true,
        thinkingConfigType: "budget",
        toolUse: true,
      },
      features: {
        streaming: true,
        functionCalling: true,
      },
      description:
        "Agnes-2.0-Flash 是 Sapiens AI 开发的快速语言模型，面向 Agent 工作流、工具调用、编码、推理和多轮对话。",
      recommendedFor: ["Agent 工作流", "代码生成", "工具调用", "多轮对话"],
    },
    priority: 30,
    enabled: true,
    description: "Agnes-2.0-Flash 官方模型元数据",
  },
  {
    id: "model-agnes-1.5-flash",
    matchType: "model",
    matchValue: "agnes-1.5-flash",
    properties: {
      icon: `/model-icons/agnes.png`,
      group: "Agnes AI",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 65500,
      pricing: {
        input: 0.07,
        output: 0.15,
        unit: "USD",
        note: "每百万 token；最大输出 65.5K token",
      },
      capabilities: {
        vision: true,
      },
      features: {
        streaming: true,
        vision: true,
      },
      description:
        "Agnes-1.5-Flash 是低延迟、高并发、低成本部署优化的轻量大语言模型，支持文本和图片多模态输入。",
      recommendedFor: ["实时对话", "高并发服务", "多模态输入"],
    },
    priority: 30,
    enabled: true,
    description: "Agnes-1.5-Flash 官方模型元数据",
  },
  {
    id: "model-agnes-1.5-pro",
    matchType: "model",
    matchValue: "agnes-1.5-pro",
    properties: {
      icon: `/model-icons/agnes.png`,
      group: "Agnes AI",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 256000,
      pricing: {
        input: 0.16,
        output: 0.8,
        unit: "USD",
        note: "每百万 token；官方已标记 Deprecated",
      },
      capabilities: {
        toolUse: true,
      },
      features: {
        streaming: true,
        functionCalling: true,
      },
      description:
        "Agnes-1.5-Pro 是面向高级自然语言理解、生成和推理的文本模型，官方文档已标记为 Deprecated。",
      recommendedFor: ["复杂推理", "文本生成"],
    },
    priority: 30,
    enabled: true,
    description: "Agnes-1.5-Pro 官方模型元数据（Deprecated）",
  },
  {
    id: "model-prefix-agnes-image",
    matchType: "modelPrefix",
    matchValue: "agnes-image-",
    properties: {
      icon: `/model-icons/agnes.png`,
      group: "Agnes AI",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      pricing: {
        unit: "USD",
        note: "官方定价 $0.003 / image",
      },
      description:
        "Agnes Image 系列图像生成与编辑模型，支持文生图、图生图、多图输入和 OpenAI Images API 兼容请求结构。",
      recommendedFor: ["图像生成", "图像编辑", "多图合成"],
    },
    priority: 25,
    enabled: true,
    description: "Agnes Image 系列模型元数据",
  },
  {
    id: "model-prefix-agnes-video",
    matchType: "modelPrefix",
    matchValue: "agnes-video-",
    properties: {
      icon: `/model-icons/agnes.png`,
      group: "Agnes AI",
      capabilities: {
        videoGeneration: true,
        vision: true,
      },
      pricing: {
        unit: "USD",
        note: "官方定价 $0.005 / second",
      },
      description:
        "Agnes Video 系列异步视频生成模型，支持文生视频、图生视频、多图参考视频和关键帧动画。",
      recommendedFor: ["文生视频", "图生视频", "关键帧动画"],
    },
    priority: 25,
    enabled: true,
    description: "Agnes Video 系列模型元数据",
  },
  {
    id: "model-prefix-agnes",
    matchType: "modelPrefix",
    matchValue: "agnes-",
    properties: {
      icon: `/model-icons/agnes.png`,
      group: "Agnes AI",
      tokenizer: "gpt4",
      description: "Agnes AI / Sapiens AI 系列模型",
    },
    priority: 20,
    enabled: true,
    description: "Agnes 系列模型图标",
  },
];
