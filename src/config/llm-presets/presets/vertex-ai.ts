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
import { claudeOpus55Capabilities } from "../../model-metadata-presets/models-anthropic";
import { gemini4ArgonCapabilities } from "../../model-metadata-presets/models-google";

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
      id: "gemini-4-argon",
      name: "Gemini 4 Argon",
      group: "Gemini 4",
      provider: "google",
      tokenLimits: { contextLength: 1048576, output: 65536 },
      capabilities: gemini4ArgonCapabilities,
      description:
        "复杂软件工程、数学与科学推理旗舰，1M 共享上下文，默认同步输出上限 65K（2026-10）",
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high"],
      },
      description:
        "最新最强的 Flash 模型，专为复杂编码、agentic 工作流与可靠多步执行打造 (2026-08)",
    },
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high"],
      },
      description:
        "上一代 Flash 模型，在通用 agentic 与日常任务中平衡速度与多模态能力 (2026-07)",
    },
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high"],
      },
      description:
        "前代 Flash 模型，为常规高吞吐工作负载提供基线速度，1M 上下文 (2026-05 GA)",
    },
    {
      id: "gemini-3.5-flash-lite",
      name: "Gemini 3.5 Flash-Lite",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "最快、最具性价比的 3.5 模型，面向高吞吐执行 (2026-07)",
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high"],
      },
      description: "企业级旗舰，改进可靠性、token 效率与多步 agentic workflow",
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash-Lite",
      group: "Gemini 3",
      provider: "google",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "低延迟、低成本多模态模型，适合高频轻量任务 (2026-05)",
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      group: "Gemini 2",
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
      group: "Gemini 2",
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
      group: "Gemini 2",
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
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      group: "Claude",
      provider: "google",
      capabilities: { vision: true, toolUse: true },
      description: "Anthropic模型集成（2025-10-01）",
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      group: "Claude",
      provider: "google",
      capabilities: { vision: true, toolUse: true },
      description: "Anthropic模型集成（2026-06-09）",
    },
    {
      id: "claude-opus-5-5",
      name: "Claude Opus 5.5",
      group: "Claude 5",
      provider: "google",
      tokenLimits: { contextLength: 1000000, output: 128000 },
      capabilities: claudeOpus55Capabilities,
      description:
        "长程智能体编码与知识工作，1M 上下文，128K 输出；自适应思考始终开启，默认 effort 为 medium（2026-09-22）",
    },
    {
      id: "claude-opus-5",
      name: "Claude Opus 5",
      group: "Claude",
      provider: "google",
      capabilities: { vision: true, toolUse: true },
      description: "Anthropic模型集成（2026-06-09）",
    },
  ],
};
