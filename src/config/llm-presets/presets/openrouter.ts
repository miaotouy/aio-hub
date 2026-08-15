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
      id: "anthropic/claude-sonnet-5",
      name: "Claude Sonnet 5",
      group: "Claude",
      provider: "openrouter",
      capabilities: {
        vision: true,
        toolUse: true,
      },
      description: "通过 OpenRouter 访问 Claude（2026-06-09）",
    },
    {
      id: "google/gemini-3.7-flash",
      name: "Gemini 3.7 Flash (Free)",
      group: "Gemini",
      provider: "openrouter",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high"],
      },
      description: "免费访问最新 Gemini Flash",
    },
    {
      id: "openai/gpt-5.5",
      name: "GPT-5.5",
      group: "GPT-5",
      provider: "openrouter",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "medium", "high"],
      },
      description: "通过 OpenRouter 访问 OpenAI GPT-5.5",
    },
    {
      id: "x-ai/grok-4.6",
      name: "Grok 4.6",
      group: "Grok",
      provider: "openrouter",
      capabilities: { vision: true, toolUse: true },
      description: "xAI 旗舰模型，500K 上下文，可配置推理",
    },
    {
      id: "deepseek/deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      group: "DeepSeek",
      provider: "openrouter",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
      description: "通过 OpenRouter 访问 DeepSeek V4 Pro",
    },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      group: "DeepSeek",
      provider: "openrouter",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
      description: "通过 OpenRouter 访问 DeepSeek V4 Flash",
    },
  ],
};
