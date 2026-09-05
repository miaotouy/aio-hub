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
      group: "Claude 4",
      provider: "anthropic",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "最快的近前沿模型，200K 上下文，64K 输出（2025-10-01）",
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      group: "Claude 5",
      provider: "anthropic",
      capabilities: {
        vision: true,
        toolUse: true,
      },
      description:
        "速度与智能的最佳结合，1M 上下文，128K 输出，自适应思考（2026-06-09）",
    },
    {
      id: "claude-opus-5",
      name: "Claude Opus 5",
      group: "Claude 5",
      provider: "anthropic",
      capabilities: {
        vision: true,
        toolUse: true,
      },
      description:
        "复杂 agentic coding 与企业级工作，1M 上下文，128K 输出，自适应思考（2026-06-09）",
    },
    {
      id: "claude-fable-5",
      name: "Claude Fable 5",
      group: "Claude 5",
      provider: "anthropic",
      capabilities: {
        vision: true,
        toolUse: true,
      },
      description:
        "Anthropic 最强模型，长程 agent 下一代智能，1M 上下文，128K 输出（2026-06-09）",
    },
  ],
};
