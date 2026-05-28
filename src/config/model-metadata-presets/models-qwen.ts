/**
 * 通义千问 (Qwen) 系列模型前缀匹配规则
 *
 * 包括 Qwen3、Qwen3.5、Qwen3.6、QwQ、QVQ 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const qwenModelRules: ModelMetadataRule[] = [
  // === 通义千问系列模型 ===
  {
    id: "model-prefix-qwen3",
    matchType: "modelPrefix",
    matchValue: "qwen3",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      description: "通义千问 Qwen3 系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 qwen3 元数据规则",
  },
  {
    id: "model-prefix-qwen",
    matchType: "modelPrefix",
    matchValue: "qwen",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      description: "通义千问系列模型",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 qwen 元数据规则",
  },
  {
    id: "model-prefix-qwq",
    matchType: "modelPrefix",
    matchValue: "qwq-",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      description: "通义千问 QwQ 系列模型",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 qwq- 元数据规则",
  },
  {
    id: "model-prefix-qwen3.6",
    matchType: "modelPrefix",
    matchValue: "qwen3.6",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      capabilities: {
        vision: true,
        thinking: true,
      },
      description: "通义千问 Qwen3.6 系列模型（原生视觉语言 + 深度思考）",
    },
    priority: 27,
    enabled: true,
    description: "模型前缀 qwen3.6 元数据规则",
  },
  {
    id: "model-prefix-qwen3.5",
    matchType: "modelPrefix",
    matchValue: "qwen3.5",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      capabilities: {
        vision: true,
        thinking: true,
      },
      description: "通义千问 Qwen3.5 系列模型（原生视觉语言 + 深度思考）",
    },
    priority: 26,
    enabled: true,
    description: "模型前缀 qwen3.5 元数据规则",
  },
  {
    id: "model-prefix-qwen3-vl",
    matchType: "modelPrefix",
    matchValue: "qwen3-vl",
    properties: {
      capabilities: {
        vision: true,
        thinking: true,
      },
      description: "Qwen3-VL 视觉理解系列（深度思考 + 视觉）",
    },
    priority: 26,
    enabled: true,
    description: "模型前缀 qwen3-vl 元数据规则",
  },
  {
    id: "model-prefix-qvq",
    matchType: "modelPrefix",
    matchValue: "qvq-",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      capabilities: {
        vision: true,
        thinking: true,
      },
      description: "通义千问 QVQ 视觉推理系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 qvq- 元数据规则",
  },

  // === 千问万象系列模型 ===
  {
    id: "model-prefix-wan-ai",
    matchType: "modelPrefix",
    matchValue: "wan-ai",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Wan",
    },
    priority: 20,
    enabled: true,
    description: "千问万象系列模型图标",
  },
  {
    id: "model-prefix-wan",
    matchType: "modelPrefix",
    matchValue: "wan2\\.\\d",
    useRegex: true,
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Wan",
    },
    priority: 20,
    enabled: true,
    description: "万象（Wan）wan2.x 系列模型图标",
  },
  {
    id: "model-prefix-wan-video",
    matchType: "modelPrefix",
    matchValue: "wan2\\.\\d+-(?:i2v|r2v|t2v|videoedit)",
    useRegex: true,
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Wan",
      capabilities: {
        videoGeneration: true,
        vision: true,
      },
      description:
        "万象（Wan）视频生成系列（图生视频 / 参考视频 / 文生视频 / 视频编辑）",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 wan2\\.\\d+-(?:i2v|r2v|t2v|videoedit) 元数据规则",
  },
  {
    id: "model-prefix-wan-image-gen",
    matchType: "modelPrefix",
    matchValue: "wan2\\.\\d+-(?:image|t2i)",
    useRegex: true,
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Wan",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "万象（Wan）图片生成系列（文生图 / 图片编辑）",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 wan2\\.\\d+-(?:image|t2i) 元数据规则",
  },

  // === 阿里 HappyHorse 系列模型 ===
  {
    id: "model-prefix-happyhorse",
    matchType: "modelPrefix",
    matchValue: "happyhorse",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "HappyHorse",
      capabilities: {
        videoGeneration: true,
      },
      description: "阿里 HappyHorse 视频生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 happyhorse 元数据规则",
  },
];
