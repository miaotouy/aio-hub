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
 * OpenAI 预设模板
 */

import type { LlmPreset } from "../types";

// OpenAI 官方
export const openaiPreset: LlmPreset = {
  type: "openai",
  name: "OpenAI",
  description: "OpenAI 官方服务",
  defaultBaseUrl: "https://api.openai.com",
  logoUrl: "/model-icons/openai.svg",
  links: [
    { label: "控制台", url: "https://platform.openai.com" },
    {
      label: "API 文档",
      url: "https://platform.openai.com/docs/api-reference",
    },
    { label: "价格页", url: "https://openai.com/api/pricing" },
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
        "旗舰模型，面向复杂推理与编码的专业工作流，1.05M 上下文，128K 输出（别名 gpt-5.6）",
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
      description: "平衡智能与成本的 GPT-5.6 模型，1.05M 上下文，128K 输出",
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
      description:
        "面向成本敏感、高吞吐工作负载的 GPT-5.6，1.05M 上下文，128K 输出",
    },
    {
      id: "gpt-oss-120b",
      name: "GPT-OSS 120B",
      group: "GPT-OSS",
      provider: "openai",
      description: "开源模型，128K 上下文",
    },
    {
      id: "gpt-image-2",
      name: "GPT Image 2",
      group: "GPT Image",
      provider: "openai",
      capabilities: { vision: true },
      description: "新一代图像生成，支持高分辨率生成、编辑和参考图",
    },
  ],
};
