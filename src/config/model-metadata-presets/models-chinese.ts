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
      icon: `/model-icons/minicpm-color.svg`,
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
      icon: `/model-icons/xiaomi.svg`,
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
];
