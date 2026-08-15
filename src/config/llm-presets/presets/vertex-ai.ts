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
 * Vertex AI 预设模板
 */

import type { LlmPreset } from "../types";

// Google Vertex AI
export const vertexAiPreset: LlmPreset = {
  type: "vertexai",
  name: "Vertex AI",
  description: "Google Cloud Vertex AI - 企业级 Gemini 模型服务",
  defaultBaseUrl: "https://us-central1-aiplatform.googleapis.com",
  logoUrl: "/model-icons/vertexai-color.svg",
  links: [
    { label: "控制台", url: "https://console.cloud.google.com/vertex-ai" },
    { label: "API 文档", url: "https://cloud.google.com/vertex-ai/docs" },
    {
      label: "价格页",
      url: "https://cloud.google.com/vertex-ai/generative-ai/pricing",
    },
  ],
  defaultModels: [
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      group: "Gemini 3.5",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description:
        "最智能 Flash 系列，强 agentic & coding 能力，1M 上下文 (2026-05 GA)",
    },
    {
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "新一代企业级旗舰，高级推理、自主编码、复杂多模态",
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      group: "Gemini 2.5",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "企业级旗舰，复杂任务王者，内置思考/编码工具",
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      group: "Gemini 2.5",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "高效企业版，成本优化，支持工具调用",
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash-Lite",
      group: "Gemini 2.5",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "轻量企业版，端侧部署友好",
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      group: "Gemini 1.5",
      provider: "google",
      capabilities: { vision: true, toolUse: true },
      description: "稳定企业版，1M上下文窗口",
    },
    {
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      group: "Gemini 1.5",
      provider: "google",
      capabilities: { vision: true },
      description: "高速企业版，大吞吐量优化",
    },
    {
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      group: "Claude",
      provider: "google",
      capabilities: { vision: true, toolUse: true },
      description: "Anthropic模型集成（2025-10-15）",
    },
  ],
};
