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
 * AI21 Labs 预设模板
 */

import type { LlmPreset } from "../types";

// AI21 Labs
export const ai21Preset: LlmPreset = {
  type: "openai",
  name: "AI21 Labs",
  description: "AI21 Labs Jamba API",
  defaultBaseUrl: "https://api.ai21.com/studio",
  logoUrl: "/model-icons/aionlabs-color.svg",
  links: [
    { label: "官网", url: "https://www.ai21.com" },
    { label: "控制台", url: "https://studio.ai21.com" },
    { label: "API 文档", url: "https://docs.ai21.com" },
    { label: "价格页", url: "https://www.ai21.com/pricing" },
  ],
  defaultModels: [
    {
      id: "jamba-reasoning-3b",
      name: "Jamba Reasoning 3B",
      group: "Jamba",
      provider: "ai21",
      capabilities: { toolUse: true },
      description: "小型推理模型，250K上下文，iPhone运行（2025-10-08）",
    },
    {
      id: "jamba-1.5-large",
      name: "Jamba 1.5 Large",
      group: "Jamba",
      provider: "ai21",
      capabilities: { toolUse: true },
      description: "SSM-Transformer混合架构，256K上下文",
    },
    {
      id: "jamba-1.5-mini",
      name: "Jamba 1.5 Mini",
      group: "Jamba",
      provider: "ai21",
      description: "轻量混合架构，256K上下文",
    },
  ],
};
