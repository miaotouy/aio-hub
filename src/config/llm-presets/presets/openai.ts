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
      id: "gpt-5",
      name: "GPT-5",
      group: "GPT-5",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "medium", "high"],
      },
      description: "旗舰多模态模型，编码与代理任务王者（2025-10-03更新）",
    },
    {
      id: "gpt-5-pro",
      name: "GPT-5 Pro",
      group: "GPT-5",
      provider: "openai",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "medium", "high"],
      },
      description: "开发者专属，API增强版",
    },
    {
      id: "gpt-5-nano",
      name: "GPT-5 Nano",
      group: "GPT-5",
      provider: "openai",
      description: "轻量高效，适合实时交互",
    },
    {
      id: "gpt-oss-120b",
      name: "GPT-OSS 120B",
      group: "GPT-OSS",
      provider: "openai",
      description: "开源变体，128K上下文",
    },
    {
      id: "gpt-image-2",
      name: "GPT Image 2",
      group: "GPT Image",
      provider: "openai",
      capabilities: { vision: true },
      description: "新一代图像生成，支持高分辨率生成、编辑与参考图",
    },
    {
      id: "gpt-image-1-mini",
      name: "GPT Image 1 Mini",
      group: "GPT Image",
      provider: "openai",
      capabilities: { vision: true },
      description: "轻量图像生成，快速输出（2025-04-15）",
    },
  ],
};
