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
 * Fireworks AI 预设模板
 */

import type { LlmPreset } from "../types";

// Fireworks AI
export const fireworksPreset: LlmPreset = {
  type: "openai",
  name: "Fireworks AI",
  description: "Fireworks AI - 超快速推理平台",
  defaultBaseUrl: "https://api.fireworks.ai",
  logoUrl: "/model-icons/fireworks-color.svg",
  links: [
    { label: "官网", url: "https://fireworks.ai" },
    { label: "控制台", url: "https://console.fireworks.ai" },
    { label: "API 文档", url: "https://docs.fireworks.ai" },
    { label: "价格页", url: "https://fireworks.ai/pricing" },
  ],
  defaultModels: [
    {
      id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
      group: "Llama",
      provider: "fireworks",
      description: "高速 Llama 推理",
    },
    {
      id: "accounts/fireworks/models/qwen3-235b-a22b-instruct",
      name: "Qwen3 235B Instruct",
      group: "Qwen3",
      provider: "fireworks",
      description: "高速千问 MoE 推理",
    },
  ],
};
