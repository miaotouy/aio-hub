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
 * Mistral AI 预设模板
 */

import type { LlmPreset } from "../types";

// Mistral AI
export const mistralPreset: LlmPreset = {
  type: "openai",
  name: "Mistral AI",
  description: "Mistral AI 官方 API",
  defaultBaseUrl: "https://api.mistral.ai",
  logoUrl: "/model-icons/mistral-color.svg",
  links: [
    { label: "官网", url: "https://mistral.ai" },
    { label: "控制台", url: "https://console.mistral.ai" },
    { label: "API 文档", url: "https://docs.mistral.ai" },
    { label: "价格页", url: "https://mistral.ai/technology/#pricing" },
  ],
  defaultModels: [
    {
      id: "mistral-large-latest",
      name: "Mistral Large Latest",
      group: "Mistral Large",
      provider: "mistral",
      capabilities: { toolUse: true },
      description: "旗舰模型，128K上下文",
    },
    {
      id: "mistral-small-latest",
      name: "Mistral Small Latest",
      group: "Mistral Small",
      provider: "mistral",
      description: "高效小模型，成本优化",
    },
    {
      id: "codestral-latest",
      name: "Codestral Latest",
      group: "Codestral",
      provider: "mistral",
      description: "代码专用模型，256K上下文",
    },
    {
      id: "magistral",
      name: "Magistral",
      group: "Magistral",
      provider: "mistral",
      capabilities: { thinking: true, thinkingConfigType: "switch" },
      description: "推理模型家族（2025-06-10）",
    },
  ],
};
