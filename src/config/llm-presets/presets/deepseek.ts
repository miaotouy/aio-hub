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
 * DeepSeek 预设模板
 */

import type { LlmPreset } from "../types";

// DeepSeek
export const deepseekPreset: LlmPreset = {
  type: "deepseek",
  name: "DeepSeek",
  description: "深度求索 API",
  defaultBaseUrl: "https://api.deepseek.com",
  logoUrl: "/model-icons/deepseek-color.svg",
  links: [
    { label: "官网", url: "https://www.deepseek.com" },
    { label: "API 文档", url: "https://api-docs.deepseek.com" },
    {
      label: "计费说明",
      url: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
    },
  ],
  defaultModels: [
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      group: "DeepSeek",
      provider: "deepseek",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
      description: "DeepSeek V4 Pro 正式版（DeepSeek-V4-Pro-0813）",
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      group: "DeepSeek",
      provider: "deepseek",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
      description: "DeepSeek V4 Flash（DeepSeek-V4-Flash-0731）",
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      group: "DeepSeek",
      provider: "deepseek",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
      },
      description: "推理专用模型 (弃用，请迁移至 V4 系列)",
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      group: "DeepSeek",
      provider: "deepseek",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
      },
      description: "通用对话模型 (弃用，请迁移至 V4 系列)",
    },
  ],
};
