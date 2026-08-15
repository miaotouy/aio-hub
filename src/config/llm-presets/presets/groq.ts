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
      description: "多功能高速版",
    },
    {
      id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant",
      group: "Llama",
      provider: "groq",
      description: "即时响应，轻量首选",
    },
    {
      id: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B 32K",
      group: "Mixtral",
      provider: "groq",
    },
    {
      id: "gemma-2-9b",
      name: "Gemma 2 9B",
      group: "Gemma",
      provider: "groq",
      description: "高效开源，价格性能比高",
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
