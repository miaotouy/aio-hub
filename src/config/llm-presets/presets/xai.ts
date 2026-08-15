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
 * xAI 预设模板
 */

import type { LlmPreset } from "../types";

// xAI (Grok)
export const xaiPreset: LlmPreset = {
  type: "xai",
  name: "xAI",
  description: "xAI Grok API",
  defaultBaseUrl: "https://api.x.ai/v1",
  logoUrl: "/model-icons/xai.svg",
  links: [
    { label: "官网", url: "https://x.ai" },
    { label: "控制台", url: "https://console.x.ai" },
    { label: "API 文档", url: "https://docs.x.ai" },
  ],
  defaultModels: [
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      group: "Grok 4.6",
      provider: "xai",
      capabilities: {
        vision: true,
        toolUse: true,
        webSearch: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "medium", "high"],
      },
      description: "旗舰模型：agentic 工具调用、低幻觉、可配置推理，500K 上下文（2026-08）",
    },
    {
      id: "grok-4.5",
      name: "Grok 4.5",
      group: "Grok 4.5",
      provider: "xai",
      capabilities: { toolUse: true, webSearch: true },
      description: "上一代旗舰模型，长上下文与实时数据接入",
    },
    {
      id: "grok-4.1-fast",
      name: "Grok 4.1 Fast",
      group: "Grok 4.1",
      provider: "xai",
      capabilities: { vision: true, toolUse: true },
      description: "面向高速 agentic 工具调用的多模态模型，2M 上下文",
    },
    {
      id: "grok-4-1-fast-non-reasoning",
      name: "Grok 4.1 Fast Non-Reasoning",
      group: "Grok 4.1",
      provider: "xai",
      capabilities: { vision: true, toolUse: true },
      description: "极速响应版，成本更低",
    },
    {
      id: "grok-4-reasoning",
      name: "Grok 4 Reasoning",
      group: "Grok 4",
      provider: "xai",
      capabilities: {
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high"],
      },
      description: "增强推理版，专攻复杂逻辑和编码",
    },
    {
      id: "imagine-v0.9",
      name: "Imagine v0.9",
      group: "Imagine",
      provider: "xai",
      capabilities: { vision: true },
      description: "图像生成模型",
    },
  ],
};
