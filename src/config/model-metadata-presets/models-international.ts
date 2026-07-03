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
 * 国际其他模型前缀匹配规则
 *
 * 包括 xAI (Grok)、Meta (Llama)、Mistral、Cohere、AI21、Microsoft (Phi)、
 * Stability AI、BAAI、Black Forest Labs (FLUX) 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const internationalModelRules: ModelMetadataRule[] = [
  // === xAI 系列模型 ===
  {
    id: "model-prefix-grok",
    matchType: "modelPrefix",
    matchValue: "grok-",
    properties: {
      icon: `/model-icons/grok.svg`,
      group: "xAI",
      tokenizer: "gpt4",
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
      icon: `/model-icons/xai.svg`,
      group: "xAI",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "xAI Imagine 系列模型图标",
  },
  {
    id: "model-grok-image",
    matchType: "modelPrefix",
    matchValue: "grok-.*image",
    useRegex: true,
    properties: {
      icon: `/model-icons/grok.svg`,
      group: "xAI",
      capabilities: {
        imageGeneration: true,
      },
      description: "Grok 图像生成与编辑模型",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 grok-.*image 元数据规则",
  },
  {
    id: "model-grok-4.1-fast",
    matchType: "model",
    matchValue:
      "(?:^|/)(?:grok[-.]4[-.]1[-.]fast|grok-4-1-fast-(?:non-)?reasoning)(?::free)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/grok.svg`,
      group: "xAI",
      tokenizer: "gpt4",
      contextLength: 2000000,
      maxOutputTokens: 30000,
      pricing: {
        input: 0.2,
        output: 0.5,
        cacheHitInput: 0.05,
        unit: "USD",
        note: "每百万 token；聚合渠道的 :free 变体价格以渠道为准",
      },
      capabilities: {
        vision: true,
        toolUse: true,
        jsonOutput: true,
      },
      description:
        "Grok 4.1 Fast / Non-Reasoning：xAI 面向高速 agentic tool calling 的多模态长上下文模型，支持 2M token 上下文。",
      recommendedFor: ["工具调用", "长上下文分析", "高吞吐对话"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 grok 4.1 fast 元数据规则",
  },

  // === Meta 系列模型 ===
  {
    id: "model-llama-3.3-70b-instruct",
    matchType: "model",
    matchValue: "(?:^|/)Llama-3\\.3-70B-Instruct$",
    useRegex: true,
    properties: {
      icon: `/model-icons/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2",
      contextLength: 128000,
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      releaseDate: "2024-12",
      knowledgeCutoff: "2023-12",
      description:
        "Llama 3.3 70B Instruct：Meta 开放权重多语言文本模型，128K 上下文，适合对话、代码、RAG 与结构化输出。",
      recommendedFor: ["多语言对话", "RAG", "代码生成", "结构化输出"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 Llama-3.3-70B-Instruct 元数据规则",
  },
  {
    id: "model-llama-3.1-instruct",
    matchType: "model",
    matchValue: "(?:^|/)Llama-3\\.1-(?:8B|70B|405B)-Instruct(?:-Turbo)?$",
    useRegex: true,
    properties: {
      icon: `/model-icons/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2",
      contextLength: 128000,
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      releaseDate: "2024-07",
      description:
        "Llama 3.1 Instruct：Meta 8B/70B/405B 开放权重指令模型家族，原生支持 128K 上下文。",
      recommendedFor: ["长上下文对话", "本地部署", "多语言任务"],
    },
    priority: 35,
    enabled: true,
    description: "模型正则 Llama-3.1 Instruct 元数据规则",
  },
  {
    id: "model-prefix-llama3_2",
    matchType: "modelPrefix",
    matchValue: "llama-?3[._-]?2",
    useRegex: true,
    properties: {
      icon: `/model-icons/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description: "Llama 3.2 系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 llama-?3[._-]?2 元数据规则",
  },
  {
    id: "model-prefix-llama",
    matchType: "modelPrefix",
    matchValue: "(?<!o)llama[1-9-]",
    useRegex: true,
    properties: {
      icon: `/model-icons/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description: "Llama 系列模型",
    },
    priority: 20,
    enabled: true,
    description: "模型正则 (?<!o)llama[1-9-] 元数据规则",
  },

  // === Mistral 系列模型 ===
  {
    id: "model-mixtral-8x7b-instruct",
    matchType: "model",
    matchValue: "(?:^|/)Mixtral-8x7B-Instruct-v0\\.1$",
    useRegex: true,
    properties: {
      icon: `/model-icons/mistral-color.svg`,
      group: "Mistral",
      tokenizer: "llama3_2",
      contextLength: 32768,
      capabilities: {
        toolUse: true,
      },
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      releaseDate: "2023-12",
      description:
        "Mixtral 8x7B Instruct v0.1：Mistral AI 的稀疏 MoE 指令模型，32K 上下文，Apache 2.0 开放权重。",
      recommendedFor: ["通用对话", "开源部署", "中长上下文任务"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 Mixtral-8x7B-Instruct-v0.1 元数据规则",
  },
  {
    id: "model-prefix-mistral",
    matchType: "modelPrefix",
    matchValue: "mistral-",
    properties: {
      icon: `/model-icons/mistral-color.svg`,
      group: "Mistral",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
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
      icon: `/model-icons/mistral-color.svg`,
      group: "Mistral",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Mixtral 系列模型图标",
  },

  // === Cohere 系列模型 ===
  {
    id: "model-command-a-plus",
    matchType: "model",
    matchValue: "command-a-plus(?:-05-2026)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 128000,
      maxOutputTokens: 64000,
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
        jsonOutput: true,
      },
      description:
        "Command A+：Cohere Command A 家族 MoE 模型，支持视觉输入、推理、工具调用、结构化输出和多语言任务。",
      recommendedFor: ["多模态 Agent", "企业工作流", "多语言任务"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 command-a-plus 元数据规则",
  },
  {
    id: "model-command-a-reasoning",
    matchType: "model",
    matchValue: "command-a-reasoning(?:-08-2025)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 32000,
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
        jsonOutput: true,
      },
      description:
        "Command A Reasoning：Cohere 首个推理模型，面向复杂 Agent、工具调用和多语言问题求解，256K 上下文。",
      recommendedFor: ["复杂推理", "Agent 工作流", "工具调用"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 command-a-reasoning 元数据规则",
  },
  {
    id: "model-command-a-vision",
    matchType: "model",
    matchValue: "command-a-vision(?:-07-2025)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 128000,
      maxOutputTokens: 8000,
      capabilities: {
        vision: true,
        document: true,
        jsonOutput: true,
      },
      description:
        "Command A Vision：Cohere 企业级视觉模型，支持图表、表格、OCR、文档问答和自然语言图像理解。",
      recommendedFor: ["图像理解", "OCR", "文档问答", "图表分析"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 command-a-vision 元数据规则",
  },
  {
    id: "model-command-a-translate",
    matchType: "model",
    matchValue: "command-a-translate(?:-08-2025)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 8000,
      maxOutputTokens: 8000,
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      description:
        "Command A Translate：Cohere 机器翻译专用模型，支持 23 种语言，8K 输入 + 8K 输出。",
      recommendedFor: ["机器翻译", "多语言本地化", "企业私有翻译"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 command-a-translate 元数据规则",
  },
  {
    id: "model-command-a-code",
    matchType: "model",
    matchValue: "command-a-code",
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 8000,
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      description:
        "Command A Code：Command A 家族代码专用变体，面向代码生成、SQL 和企业级开发任务。",
      recommendedFor: ["代码生成", "SQL", "企业开发辅助"],
    },
    priority: 36,
    enabled: true,
    description: "模型 command-a-code 元数据规则",
  },
  {
    id: "model-command-a-search",
    matchType: "model",
    matchValue: "command-a-search",
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 8000,
      capabilities: {
        toolUse: true,
        webSearch: true,
        jsonOutput: true,
      },
      description:
        "Command A Search：Command A 家族搜索增强变体，适合检索、引用和事实整合工作流。",
      recommendedFor: ["搜索增强问答", "RAG", "事实核查"],
    },
    priority: 36,
    enabled: true,
    description: "模型 command-a-search 元数据规则",
  },
  {
    id: "model-command-a",
    matchType: "model",
    matchValue: "command-a(?:-03-2025)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 256000,
      maxOutputTokens: 8000,
      pricing: {
        input: 2.5,
        output: 10,
        unit: "USD",
        note: "每百万 token",
      },
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      description:
        "Command A：Cohere 企业级主力模型，111B 参数，面向工具调用、Agent、RAG 和多语言任务，256K 上下文。",
      recommendedFor: ["企业 Agent", "RAG", "工具调用", "多语言对话"],
    },
    priority: 35,
    enabled: true,
    description: "模型正则 command-a 元数据规则",
  },
  {
    id: "model-command-r-plus",
    matchType: "model",
    matchValue: "command-r-plus(?:-(?:08|04)-2024)?",
    useRegex: true,
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 128000,
      maxOutputTokens: 4000,
      pricing: {
        input: 2.5,
        output: 10,
        unit: "USD",
        note: "每百万 token；command-r-plus 无日期别名为旧版，官方已标记 Deprecated",
      },
      capabilities: {
        toolUse: true,
        jsonOutput: true,
      },
      description:
        "Command R+：Cohere 面向复杂 RAG、多步工具调用和企业工作流的长上下文模型；无日期别名为旧版。",
      recommendedFor: ["复杂 RAG", "多步工具调用", "企业知识库"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 command-r-plus 元数据规则",
  },
  {
    id: "model-command-light",
    matchType: "model",
    matchValue: "command-light",
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      contextLength: 4000,
      maxOutputTokens: 4000,
      deprecated: true,
      description:
        "Command Light：Cohere 旧版轻量 Command 模型，官方已于 2025-09 标记 Deprecated。",
      recommendedFor: ["轻量文本生成"],
    },
    priority: 36,
    enabled: true,
    description: "模型 command-light 元数据规则",
  },
  {
    id: "model-prefix-command",
    matchType: "modelPrefix",
    matchValue: "command-",
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
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
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Aya 系列模型图标",
  },

  // === AI21 系列模型 ===
  {
    id: "model-prefix-jamba",
    matchType: "modelPrefix",
    matchValue: "jamba-",
    properties: {
      icon: `/model-icons/aionlabs-color.svg`,
      group: "AI21",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Jamba 系列模型图标",
  },

  // === Microsoft 系列模型 ===
  {
    id: "model-phi-3-mini-4k",
    matchType: "model",
    matchValue: "(?:^|/)Phi-3-mini-4k-instruct$",
    useRegex: true,
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft",
      tokenizer: "gpt4",
      contextLength: 4096,
      maxOutputTokens: 4096,
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      releaseDate: "2024-04",
      description:
        "Phi-3 Mini 4K Instruct：Microsoft 3.8B 轻量开放模型，4K 上下文，适合端侧和低资源推理。",
      recommendedFor: ["端侧部署", "轻量对话", "低资源推理"],
    },
    priority: 36,
    enabled: true,
    description: "模型正则 Phi-3-mini-4k-instruct 元数据规则",
  },
  {
    id: "model-prefix-phi-3",
    matchType: "modelPrefix",
    matchValue: "phi-3",
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft",
      tokenizer: "gpt4",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description: "Phi-3 系列轻量开放模型",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 phi-3 元数据规则",
  },
  {
    id: "model-prefix-microsoft",
    matchType: "modelPrefix",
    matchValue: "microsoft",
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft",
    },
    priority: 15,
    enabled: true,
    description: "Microsoft 系列模型（通过 ID 匹配）",
  },
  {
    id: "model-prefix-phi",
    matchType: "modelPrefix",
    matchValue: "phi-",
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Phi 系列模型图标",
  },

  // === Stability AI 系列模型 ===
  {
    id: "model-prefix-stable-diffusion",
    matchType: "modelPrefix",
    matchValue: "stable-diffusion",
    properties: {
      icon: `/model-icons/stability-color.svg`,
      group: "Stability AI",
    },
    priority: 20,
    enabled: true,
    description: "Stable Diffusion 系列模型图标",
  },

  // === BAAI 系列模型 ===
  {
    id: "model-prefix-bge",
    matchType: "modelPrefix",
    matchValue: "bge-",
    properties: {
      icon: `/model-icons/baai.svg`,
      group: "BAAI",
    },
    priority: 20,
    enabled: true,
    description: "BAAI BGE 系列模型图标",
  },

  // === Black Forest Labs 系列模型 ===
  {
    id: "model-prefix-flux",
    matchType: "modelPrefix",
    matchValue: "flux",
    properties: {
      icon: `/model-icons/flux.svg`,
      group: "Black Forest Labs",
    },
    priority: 20,
    enabled: true,
    description: "FLUX 系列模型图标",
  },
];
