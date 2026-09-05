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
 * OpenAI Responses 预设模板
 */

import type { LlmPreset } from "../types";

// OpenAI Responses API
export const openaiResponsesPreset: LlmPreset = {
  type: "openai-responses",
  name: "OpenAI Responses",
  description: "OpenAI Responses API - 新一代有状态交互接口",
  defaultBaseUrl: "https://api.openai.com",
  logoUrl: "/model-icons/openai.svg",
  links: [
    { label: "控制台", url: "https://platform.openai.com" },
    {
      label: "API 文档",
      url: "https://platform.openai.com/docs/api-reference/responses",
    },
  ],
  defaultModels: [
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      group: "GPT-5.6",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        fileSearch: true,
        codeExecution: true,
        computerUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
        ],
      },
      description:
        "Responses 旗舰，复杂推理与编码，1.05M 上下文（别名 gpt-5.6）",
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT-5.6 Terra",
      group: "GPT-5.6",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        fileSearch: true,
        codeExecution: true,
        computerUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
        ],
      },
      description: "平衡智能与成本的 Responses 模型，1.05M 上下文",
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      group: "GPT-5.6",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        fileSearch: true,
        codeExecution: true,
        computerUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
        ],
      },
      description: "成本敏感、高吞吐工作负载的 Responses 模型，1.05M 上下文",
    },
    {
      id: "gpt-realtime-2.1",
      name: "GPT-Realtime 2.1",
      group: "GPT Realtime",
      provider: "openai",
      capabilities: { audio: true, toolUse: true, vision: true },
      description: "实时语音对话推理模型，支持工具调用",
    },
    {
      id: "gpt-realtime-2.1-mini",
      name: "GPT-Realtime 2.1 mini",
      group: "GPT Realtime",
      provider: "openai",
      capabilities: { audio: true, toolUse: true, vision: true },
      description: "实时语音对话轻量版，低成本低延迟",
    },
    {
      id: "gpt-image-2",
      name: "GPT Image 2",
      group: "GPT Image",
      provider: "openai",
      capabilities: { vision: true },
      description: "新一代图像生成与编辑模型",
    },
  ],
};
