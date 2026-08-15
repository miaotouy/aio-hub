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
      id: "gpt-5.1",
      name: "GPT-5.1",
      group: "GPT-5",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        fileSearch: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["none", "minimal", "low", "medium", "high"],
      },
      description: "Responses旗舰，内置文件/网络搜索，多模态交互",
    },
    {
      id: "gpt-5.1-pro",
      name: "GPT-5.1 Pro",
      group: "GPT-5",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        fileSearch: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["none", "minimal", "low", "medium", "high"],
      },
      description: "开发者增强版，扩展工具集成",
    },
    {
      id: "gpt-5.1-compact",
      name: "GPT-5.1 Compact",
      group: "GPT-5",
      provider: "openai",
      capabilities: { toolUse: true, webSearch: true },
      description: "轻量版，快速响应，成本优化",
    },
    {
      id: "o3-pro",
      name: "o3-pro",
      group: "o3",
      provider: "openai",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "推理旗舰，可调节推理力度，复杂问题解决专家",
    },
    {
      id: "o3-mini",
      name: "o3-mini",
      group: "o3",
      provider: "openai",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "推理轻量版，高效逻辑推理",
    },
    {
      id: "gpt-4o-responses",
      name: "GPT-4o Responses",
      group: "GPT-4o",
      provider: "openai",
      capabilities: { vision: true, toolUse: true, webSearch: true },
      description: "4o系列Responses版，平衡性能与成本",
    },
  ],
};
