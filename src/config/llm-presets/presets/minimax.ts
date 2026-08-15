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
      id: "abab6.5s-chat",
      name: "ABAB 6.5s Chat",
      group: "ABAB 6.5",
      provider: "minimax",
      capabilities: { toolUse: true },
      description: "旗舰对话模型，245K上下文",
    },
    {
      id: "abab6.5t-chat",
      name: "ABAB 6.5t Chat",
      group: "ABAB 6.5",
      provider: "minimax",
      description: "文本专用，高效处理",
    },
    {
      id: "abab6.5g-chat",
      name: "ABAB 6.5g Chat",
      group: "ABAB 6.5",
      provider: "minimax",
      capabilities: { vision: true },
      description: "多模态版本，支持图像理解",
    },
    {
      id: "minimax-01",
      name: "MiniMax-01",
      group: "MiniMax",
      provider: "minimax",
      description: "456B参数模型，MMLU 88.5%（2025-01）",
    },
    {
      id: "minimax-m1",
      name: "MiniMax-M1",
      group: "MiniMax",
      provider: "minimax",
      description: "开源1M令牌上下文模型（2025-06-16）",
    },
  ],
};
