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
 * OpenAI 系列模型前缀匹配规则
 *
 * 包括 GPT-4o、GPT-5.5/GPT-5、GPT-4.1、GPT-4、GPT-3.5、o1/o3/o4 推理系列、ChatGPT 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

// ==========================================
// OpenAI 能力预设模板
// ==========================================

// 1. 视觉 Token 计费规则 (OpenAI 瓦片计算法)
const openaiVisionTokenCost = {
  calculationMethod: "openai_tile" as const,
  parameters: {
    baseCost: 85,
    tileCost: 170,
    tileSize: 512,
  },
};

// 2. 文档 Token 计费规则 (动态计算)
const openaiDocumentTokenCost = {
  calculationMethod: "dynamic" as const,
};

// 3. 基础文档处理能力
const openaiDocumentCapabilities = {
  document: true,
  documentFormat: "openai_file" as const,
  documentTokenCost: openaiDocumentTokenCost,
};

// 4. 基础视觉与工具能力 (GPT-4o, GPT-4.1 级别)
const openaiBaseCapabilities = {
  vision: true,
  toolUse: true,
  jsonOutput: true, // 支持 JSON 输出模式
  ...openaiDocumentCapabilities,
  visionTokenCost: openaiVisionTokenCost,
};

// 5. 基础推理能力 (o1, o3, o4-mini 级别)
const openaiReasoningCapabilities = {
  thinking: true,
  thinkingConfigType: "effort" as const,
  reasoningEffortOptions: ["low", "medium", "high"],
};

// 6. 完整推理能力 (o3, o4-mini 级别，带视觉、工具、JSON、文档，但无 visionTokenCost)
const openaiReasoningFullCapabilities = {
  ...openaiReasoningCapabilities,
  vision: true,
  toolUse: true,
  jsonOutput: true,
  ...openaiDocumentCapabilities,
};

// 7. 旗舰级能力 (GPT-5.x 级别)
const openaiFlagshipCapabilities = {
  ...openaiBaseCapabilities,
  webSearch: true,
  fileSearch: true,
  codeExecution: true,
  computerUse: true,
  thinking: true,
  thinkingConfigType: "effort" as const,
  reasoningEffortOptions: ["none", "low", "medium", "high", "xhigh"],
};

// ==========================================
// OpenAI 模型规则定义
// ==========================================

export const openaiModelRules: ModelMetadataRule[] = [
  {
    id: "model-prefix-gpt-4o",
    matchType: "modelPrefix",
    matchValue: "gpt-4o",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // 使用 o200k_base 编码
      capabilities: openaiBaseCapabilities,
      description:
        "GPT-4o 系列模型（使用 o200k_base 编码，支持视觉、工具调用和文档处理）",
    },
    priority: 25, // 更高优先级，优先匹配 gpt-4o
    enabled: true,
    description: "模型前缀 gpt-4o 元数据规则",
  },
  {
    id: "model-prefix-gpt-5.5",
    matchType: "modelPrefix",
    matchValue: "gpt-5.5",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-5.5 使用 o200k_base 编码
      capabilities: openaiFlagshipCapabilities,
      description: "GPT-5.5 旗舰模型（面向复杂推理、编码和工具密集型工作流）",
    },
    priority: 28,
    enabled: true,
    description: "模型前缀 gpt-5.5 元数据规则",
  },
  {
    id: "model-prefix-gpt-5.4-small",
    matchType: "modelPrefix",
    matchValue: "gpt-5\\.4-(?:mini|nano)",
    useRegex: true,
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-5.4 mini/nano 使用 o200k_base 编码
      capabilities: {
        ...openaiFlagshipCapabilities,
        computerUse: false, // mini/nano 不支持 computerUse
        reasoningEffortOptions: ["none", "low", "medium", "high"], // 不支持 xhigh
      },
      description:
        "GPT-5.4 mini/nano 系列模型（低延迟、低成本，支持视觉和工具工作流）",
    },
    priority: 27,
    enabled: true,
    description: "模型正则 gpt-5\\.4-(?:mini|nano) 元数据规则",
  },
  {
    id: "model-prefix-gpt-5.4",
    matchType: "modelPrefix",
    matchValue: "gpt-5.4",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-5.4 使用 o200k_base 编码
      capabilities: openaiFlagshipCapabilities,
      description: "GPT-5.4 系列模型（支持推理、视觉、工具调用和文档处理）",
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
        ...openaiFlagshipCapabilities,
        reasoningEffortOptions: ["none", "low", "medium", "high"], // 不支持 xhigh
      },
      description:
        "GPT-5 系列模型（包括 mini/nano 等变体，支持推理、视觉、工具调用 and 文档处理）",
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
      capabilities: {
        imageGeneration: true,
        vision: true,
        iterativeRefinement: true,
      },
      description:
        "GPT Image 系列图像生成模型（支持生成、编辑与参考图；多轮上下文需走 Responses/Chat 类路由）",
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
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort" as const,
      },
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
        toolUse: true,
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
        toolUse: true,
      },
      description:
        "GPT Realtime 实时音频模型系列（包括 2、1.5、转写和翻译变体）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 gpt-realtime 元数据规则",
  },
  {
    id: "model-prefix-computer-use-preview",
    matchType: "modelPrefix",
    matchValue: "computer-use-preview",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
      capabilities: {
        computerUse: true,
        vision: true,
        toolUse: true,
      },
      description: "OpenAI Computer Use 预览模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 computer-use-preview 元数据规则",
  },
  {
    id: "model-prefix-gpt-4.1",
    matchType: "modelPrefix",
    matchValue: "gpt-4.1",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o", // GPT-4.1 使用 o200k_base 编码
      capabilities: openaiBaseCapabilities,
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
        visionTokenCost: openaiVisionTokenCost,
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
        ...openaiReasoningCapabilities,
        vision: true, // o1 支持视觉输入
        ...openaiDocumentCapabilities,
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
      capabilities: openaiReasoningFullCapabilities,
      description: "o4-mini 快速经济推理模型（支持视觉和工具调用）",
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
        ...openaiReasoningCapabilities,
        webSearch: true,
        fileSearch: true,
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
        ...openaiReasoningCapabilities,
        toolUse: true,
        ...openaiDocumentCapabilities,
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
        ...openaiReasoningCapabilities,
        toolUse: true,
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
      capabilities: openaiReasoningFullCapabilities,
      description:
        "o3 系列推理模型（使用 o200k_base 编码，支持视觉和工具调用）",
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
      "^(?:o1-mini|o1-preview|gpt-4.5-preview|gpt-4-turbo-preview|codex-mini-latest|dall-e-2|dall-e-3|chatgpt-4o-latest|babbage-002|davinci-002|text-moderation-latest|text-moderation-stable)$",
    useRegex: true,
    properties: {
      deprecated: true,
    },
    priority: 20,
    enabled: true,
    description: "标注已废弃的特定 OpenAI 模型",
  },
];
