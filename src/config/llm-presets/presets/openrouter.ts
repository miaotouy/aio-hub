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
 * OpenRouter 预设模板
 */

import type { LlmPreset } from "../types";

// OpenRouter
export const openrouterPreset: LlmPreset = {
  type: "openrouter",
  name: "OpenRouter",
  description: "OpenRouter - 统一多个 AI 模型的聚合 API",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  logoUrl: "/model-icons/openrouter.svg",
  links: [
    { label: "官网", url: "https://openrouter.ai" },
    { label: "API 文档", url: "https://openrouter.ai/docs" },
    { label: "模型列表", url: "https://openrouter.ai/models" },
  ],
  defaultModels: [
    {
      id: "anthropic/claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      group: "Claude",
      provider: "openrouter",
      capabilities: { vision: true, toolUse: true },
      description: "通过 OpenRouter 访问 Claude（2025-10-15）",
    },
    {
      id: "google/gemini-2.5-flash-preview-09-2025",
      name: "Gemini 2.5 Flash (Free)",
      group: "Gemini",
      provider: "openrouter",
      capabilities: { vision: true },
      description: "免费访问 Gemini Flash",
    },
    {
      id: "deepseek/deepseek-chat",
      name: "DeepSeek Chat",
      group: "DeepSeek",
      provider: "openrouter",
      description: "通过 OpenRouter 访问 DeepSeek",
    },
  ],
};
