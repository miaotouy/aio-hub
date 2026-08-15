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
 * Groq 预设模板
 */

import type { LlmPreset } from "../types";

// Groq
export const groqPreset: LlmPreset = {
  type: "groq",
  name: "Groq",
  description: "Groq 高速推理 API",
  defaultBaseUrl: "https://api.groq.com/openai/v1",
  logoUrl: "/model-icons/groq.svg",
  links: [
    { label: "官网", url: "https://groq.com/" },
    { label: "控制台", url: "https://console.groq.com/" },
    { label: "API 文档", url: "https://console.groq.com/docs/" },
    { label: "计费说明", url: "https://wow.groq.com/pricing/" },
  ],
  defaultModels: [
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B Versatile",
      group: "Llama",
      provider: "groq",
      capabilities: { toolUse: true },
      description: "多功能高速版",
    },
    {
      id: "gpt-oss-120b",
      name: "GPT-OSS 120B",
      group: "GPT-OSS",
      provider: "groq",
      description: "开源变体，128K上下文",
    },
  ],
};
