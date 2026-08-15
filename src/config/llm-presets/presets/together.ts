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
 * Together AI 预设模板
 */

import type { LlmPreset } from "../types";

// Together AI
export const togetherPreset: LlmPreset = {
  type: "openai",
  name: "Together AI",
  description: "Together AI - 开源模型推理平台",
  defaultBaseUrl: "https://api.together.xyz",
  logoUrl: "/model-icons/together-color.svg",
  links: [
    { label: "官网", url: "https://www.together.ai" },
    { label: "控制台", url: "https://api.together.xyz" },
    { label: "API 文档", url: "https://docs.together.ai" },
    { label: "价格页", url: "https://www.together.ai/pricing" },
  ],
  defaultModels: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      name: "Llama 3.3 70B Turbo",
      group: "Llama",
      provider: "together",
      capabilities: { toolUse: true },
      description: "开源旗舰模型",
    },
    {
      id: "Qwen/Qwen3-235B-A22B-Instruct",
      name: "Qwen3 235B Instruct",
      group: "Qwen3",
      provider: "together",
      description: "千问 MoE 旗舰",
    },
  ],
};
