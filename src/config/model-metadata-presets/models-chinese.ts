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
