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
 * MiniMax 预设模板
 */

import type { LlmPreset } from "../types";

// MiniMax
export const minimaxPreset: LlmPreset = {
  type: "openai",
  name: "MiniMax",
  description: "MiniMax ABAB API",
  defaultBaseUrl: "https://api.minimax.chat",
  logoUrl: "/model-icons/minimax-color.svg",
  links: [
    { label: "官网", url: "https://www.minimaxi.com" },
    { label: "控制台", url: "https://platform.minimaxi.com" },
    {
      label: "API 文档",
      url: "https://platform.minimaxi.com/docs/api-reference/api-overview",
    },
    {
      label: "计费说明",
      url: "https://platform.minimaxi.com/docs/guides/pricing-speech",
    },
  ],
  defaultModels: [
    {
      id: "MiniMax-M3",
      name: "MiniMax-M3",
      group: "MiniMax M",
      provider: "minimax",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
      },
      description: "最新旗舰，原生多模态，1M 上下文",
    },
    {
      id: "MiniMax-M2.7",
      name: "MiniMax-M2.7",
      group: "MiniMax M",
      provider: "minimax",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
      },
      description: "204.8K 上下文，Agent 与代码优化",
    },
    {
      id: "MiniMax-M2.5",
      name: "MiniMax-M2.5",
      group: "MiniMax M",
      provider: "minimax",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
      },
      description: "204.8K 上下文，高性价比主力",
    },
  ],
};
