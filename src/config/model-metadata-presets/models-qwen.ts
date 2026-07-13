// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 通义千问 (Qwen) 系列模型前缀匹配规则
 *
 * 包括 Qwen3.7、Qwen3.6、Qwen3.5、Qwen3、Qwen-Omni、Qwen3-Coder、
 * Qwen Image、Wan、QwQ、QVQ 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

// ==========================================
// Qwen 能力预设模板
// ==========================================

// 1. 基础思考能力
const qwenThinkingCapabilities = {
  thinking: true,
  thinkingConfigType: "budget" as const,
};

// 2. 基础工具与 JSON 能力
const qwenBaseCapabilities = {
  toolUse: true,
  jsonOutput: true,
};

// 3. 基础视觉能力
const qwenVisionCapabilities = {
  vision: true,
  maxImageDimension: 4096,
};

// 4. 视觉与视频能力
const qwenVisionVideoCapabilities = {
  ...qwenVisionCapabilities,
  video: true,
};

// 5. 旗舰级全模态/多功能能力 (Qwen3.6, Qwen3.5 级别)
const qwenFlagshipCapabilities = {
  ...qwenVisionVideoCapabilities,
  ...qwenThinkingCapabilities,
  toolUse: true,
  webSearch: true,
  codeExecution: true,
  jsonOutput: true,
};

// ==========================================
// Qwen 模型规则定义
// ==========================================

export const qwenModelRules: ModelMetadataRule[] = [
  // === 通义千问系列模型 ===
  {
    id: "model-prefix-qwen3.7",
    matchType: "modelPrefix",
    matchValue: "qwen3.7",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3.7",
      tokenizer: "qwen3",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      capabilities: {
        ...qwenThinkingCapabilities,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description:
        "通义千问 Qwen3.7 旗舰系列模型（1M 上下文，支持思考、函数调用和内置工具）",
    },
    priority: 29,
    enabled: true,
    description: "模型前缀 qwen3.7 元数据规则",
  },
  {
    id: "model-prefix-qwen3-coder",
    matchType: "modelPrefix",
    matchValue: "qwen3-coder",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3 Coder",
      tokenizer: "qwen3",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      capabilities: {
        ...qwenBaseCapabilities,
        codeExecution: true,
        fim: true,
      },
      description:
        "通义千问 Qwen3-Coder 代码模型系列（长上下文、函数调用、代码/Agent 任务）",
    },
    priority: 28,
    enabled: true,
    description: "模型前缀 qwen3-coder 元数据规则",
  },
  {
    id: "model-prefix-qwen3",
    matchType: "modelPrefix",
    matchValue: "qwen3",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      tokenizer: "qwen3",
      capabilities: {
        ...qwenThinkingCapabilities,
        ...qwenBaseCapabilities,
      },
      description: "通义千问 Qwen3 系列模型（支持思考与函数调用）",
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
      capabilities: qwenBaseCapabilities,
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
      capabilities: qwenThinkingCapabilities,
      description: "通义千问 QwQ 推理系列模型",
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
      group: "Qwen3.6",
      tokenizer: "qwen3",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      capabilities: qwenFlagshipCapabilities,
      description:
        "通义千问 Qwen3.6 系列模型（1M 上下文，原生图像/视频理解、思考、函数调用和内置工具）",
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
      group: "Qwen3.5",
      tokenizer: "qwen3",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      capabilities: qwenFlagshipCapabilities,
      description:
        "通义千问 Qwen3.5 系列模型（1M 上下文，原生图像/视频理解、思考、函数调用和内置工具）",
    },
    priority: 26,
    enabled: true,
    description: "模型前缀 qwen3.5 元数据规则",
  },
  {
    id: "model-prefix-qwen3.5-omni",
    matchType: "modelPrefix",
    matchValue: "qwen3.5-omni",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3.5 Omni",
      tokenizer: "qwen3",
      contextLength: 262144,
      maxOutputTokens: 65536,
      capabilities: {
        ...qwenVisionVideoCapabilities,
        audio: true,
        audioGeneration: true,
        toolUse: true,
        thinking: false,
        thinkingConfigType: "none" as const,
        webSearch: false,
        codeExecution: false,
        jsonOutput: false,
      },
      description:
        "Qwen3.5-Omni 全模态模型（文本、图像、音频、视频输入，文本/语音输出，支持实时变体）",
    },
    priority: 28,
    enabled: true,
    description: "模型前缀 qwen3.5-omni 元数据规则",
  },
  {
    id: "model-prefix-qwen3-omni",
    matchType: "modelPrefix",
    matchValue: "qwen3-omni",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3 Omni",
      tokenizer: "qwen3",
      capabilities: {
        audio: true,
        audioGeneration: true,
        video: true,
      },
      description: "Qwen3-Omni 多模态音视频理解与语音交互模型",
    },
    priority: 28,
    enabled: true,
    description: "模型前缀 qwen3-omni 元数据规则",
  },
  {
    id: "model-prefix-qwen3-vl",
    matchType: "modelPrefix",
    matchValue: "qwen3-vl",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3 VL",
      tokenizer: "qwen3",
      capabilities: {
        ...qwenVisionVideoCapabilities,
        ...qwenThinkingCapabilities,
        ...qwenBaseCapabilities,
      },
      description: "Qwen3-VL 视觉理解系列（图像/视频理解、深度思考和函数调用）",
    },
    priority: 26,
    enabled: true,
    description: "模型前缀 qwen3-vl 元数据规则",
  },
  {
    id: "model-prefix-qwen-vl",
    matchType: "modelPrefix",
    matchValue: "qwen-vl",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen VL",
      tokenizer: "qwen3",
      capabilities: qwenVisionCapabilities,
      description: "通义千问视觉语言模型系列（含 OCR 等视觉理解变体）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 qwen-vl 元数据规则",
  },
  {
    id: "model-prefix-qwen3-asr",
    matchType: "modelPrefix",
    matchValue: "qwen3-asr",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3 ASR",
      tokenizer: "qwen3",
      capabilities: {
        audio: true,
        thinking: false,
        thinkingConfigType: "none" as const,
        toolUse: false,
        jsonOutput: false,
      },
      description: "Qwen3-ASR 语音识别系列（实时/文件转写，支持情绪识别变体）",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 qwen3-asr 元数据规则",
  },
  {
    id: "model-prefix-qwen3-tts",
    matchType: "modelPrefix",
    matchValue: "qwen3-tts",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen3 TTS",
      tokenizer: "qwen3",
      capabilities: {
        audioGeneration: true,
        thinking: false,
        thinkingConfigType: "none" as const,
        toolUse: false,
        jsonOutput: false,
      },
      description:
        "Qwen3-TTS 语音合成系列（流式、指令控制、声音克隆和声音设计变体）",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 qwen3-tts 元数据规则",
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
        ...qwenVisionCapabilities,
        ...qwenThinkingCapabilities,
      },
      description: "通义千问 QVQ 视觉推理系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 qvq- 元数据规则",
  },
  {
    id: "model-prefix-qwen-mt",
    matchType: "modelPrefix",
    matchValue: "qwen-mt",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen MT",
      tokenizer: "qwen3",
      contextLength: 16384,
      maxOutputTokens: 8192,
      capabilities: {
        toolUse: false,
        jsonOutput: false,
      },
      description: "通义千问机器翻译专用模型系列",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 qwen-mt 元数据规则",
  },

  // === 通义千问图像、向量与重排系列模型 ===
  {
    id: "model-prefix-qwen-image-2",
    matchType: "modelPrefix",
    matchValue: "qwen-image-2.0",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen Image",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
        vision: true,
        toolUse: false,
        jsonOutput: false,
      },
      description:
        "Qwen Image 2.0 图像生成与编辑系列（最高 2048×2048，最多 6 张输出）",
    },
    priority: 34,
    enabled: true,
    description: "模型前缀 qwen-image-2.0 元数据规则",
  },
  {
    id: "model-prefix-text-embedding",
    matchType: "modelPrefix",
    matchValue: "text-embedding-v",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen Embedding",
      capabilities: {
        embedding: true,
      },
      contextLength: 8192,
      maxEmbeddingDimensions: 2048,
      recommendedEmbeddingDimensions: [512, 1024, 1536, 2048],
      description: "通义文本向量模型（text-embedding-v4/v3，支持可选输出维度）",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 text-embedding-v 元数据规则",
  },
  {
    id: "model-prefix-tongyi-embedding-vision",
    matchType: "modelPrefix",
    matchValue: "tongyi-embedding-vision",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen Embedding",
      capabilities: {
        embedding: true,
        vision: true,
        video: true,
      },
      contextLength: 1024,
      description: "通义多模态向量模型（文本、图像、视频跨模态检索）",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 tongyi-embedding-vision 元数据规则",
  },
  {
    id: "model-prefix-qwen3-rerank",
    matchType: "modelPrefix",
    matchValue: "qwen3-rerank",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen Rerank",
      capabilities: {
        rerank: true,
        thinking: false,
        thinkingConfigType: "none" as const,
        toolUse: false,
        jsonOutput: false,
      },
      maxDocuments: 500,
      maxTokensPerDocument: 4000,
      description: "Qwen3-Rerank 重排模型（RAG 检索精排，单次最多 500 篇文档）",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 qwen3-rerank 元数据规则",
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
    matchValue: "wan2\\.\\d+-(?:i2v|r2v|t2v|videoedit|animate)",
    useRegex: true,
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Wan",
      capabilities: {
        videoGeneration: true,
        vision: true,
      },
      description:
        "万象（Wan）视频生成系列（文生视频 / 图生视频 / 参考视频 / 视频编辑 / 角色动画）",
    },
    priority: 25,
    enabled: true,
    description:
      "模型正则 wan2\\.\\d+-(?:i2v|r2v|t2v|videoedit|animate) 元数据规则",
  },
  {
    id: "model-prefix-wan-image-gen",
    matchType: "modelPrefix",
    matchValue: "wan2\\.\\d+-(?:image|t2i|i2i)",
    useRegex: true,
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Wan",
      capabilities: {
        imageGeneration: true,
        vision: true,
        iterativeRefinement: true,
      },
      description: "万象（Wan）图片生成系列（文生图 / 图片编辑）",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 wan2\\.\\d+-(?:image|t2i|i2i) 元数据规则",
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
