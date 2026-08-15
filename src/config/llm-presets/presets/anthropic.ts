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
 * Anthropic Claude 预设模板
 */

import type { LlmPreset } from "../types";

// Anthropic Claude
export const anthropicPreset: LlmPreset = {
  type: "claude",
  name: "Anthropic Claude",
  description: "Anthropic Claude API",
  defaultBaseUrl: "https://api.anthropic.com",
  logoUrl: "/model-icons/claude-color.svg",
  links: [
    { label: "控制台", url: "https://console.anthropic.com" },
    {
      label: "API 文档",
      url: "https://docs.anthropic.com/claude/reference/getting-started-with-the-api",
    },
    { label: "价格页", url: "https://www.anthropic.com/pricing" },
  ],
  defaultModels: [
    {
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      group: "Claude 4.5",
      provider: "anthropic",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "小模型旗舰，成本敏感任务专家（2025-10-15）",
    },
    {
      id: "claude-sonnet-4.5-20250929",
      name: "Claude Sonnet 4.5",
      group: "Claude 4.5",
      provider: "anthropic",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "编码/代理/计算机使用顶级，SWE-bench 77.2%（2025-09-29）",
    },
    {
      id: "claude-opus-4.1-20250805",
      name: "Claude Opus 4.1",
      group: "Claude 4",
      provider: "anthropic",
      capabilities: {
        vision: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "旗舰推理模型",
    },
    {
      id: "claude-3.7-sonnet-20250219",
      name: "Claude 3.7 Sonnet",
      group: "Claude 3.7",
      provider: "anthropic",
      capabilities: {
        vision: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
    },
  ],
};
