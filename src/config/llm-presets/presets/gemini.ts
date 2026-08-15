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
 * Google Gemini 预设模板
 */

import type { LlmPreset } from "../types";

// Google Gemini
export const geminiPreset: LlmPreset = {
  type: "gemini",
  name: "Google Gemini",
  description: "Google Gemini API",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  logoUrl: "/model-icons/gemini-color.svg",
  links: [
    { label: "AI Studio", url: "https://aistudio.google.com" },
    { label: "API 文档", url: "https://ai.google.dev/gemini-api/docs" },
    { label: "价格页", url: "https://ai.google.dev/pricing" },
  ],
  defaultModels: [
    // 别名
    {
      id: "gemini-flash-lite-latest",
      name: "Gemini Flash Lite Latest",
      group: "Gemini",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "指向 Flash Lite 模型最新版本的别名",
    },
    {
      id: "gemini-flash-latest",
      name: "Gemini Flash Latest",
      group: "Gemini",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "指向 Flash 模型最新版本的别名",
    },
    {
      id: "gemini-pro-latest",
      name: "Gemini Pro Latest",
      group: "Gemini",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "指向 PRO 模型最新版本的别名",
    },
    // Gemini 3.7
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      group: "Gemini 3.7",
      provider: "gemini",
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
    // Gemini 3.6
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      group: "Gemini 3.6",
      provider: "gemini",
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
    // Gemini 3.5
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      group: "Gemini 3.5",
      provider: "gemini",
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
      group: "Gemini 3.5",
      provider: "gemini",
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
      id: "gemini-3.5-live-translate-preview",
      name: "Gemini 3.5 Live Translate",
      group: "Gemini 3.5",
      provider: "gemini",
      capabilities: { audio: true, audioGeneration: true },
      description: "低延迟、实时的语音到语音翻译模型，支持 70+ 语言 (2026-08)",
    },
    // Gemini 3.1
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      group: "Gemini 3.1",
      provider: "gemini",
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
        "高级智能与复杂问题解决，强大的 agentic 和 vibe coding 能力 (Preview)",
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash-Lite",
      group: "Gemini 3.1",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "Frontier 级性能，成本远低于更大模型 (Stable)",
    },
    // 图像生成（Nano Banana 系列）
    {
      id: "gemini-3.1-flash-image",
      name: "Nano Banana 2",
      group: "Gemini 3.1",
      provider: "gemini",
      capabilities: { vision: true, imageGeneration: true, preferChat: true },
      description: "高效图像生成与编辑，面向速度与高吞吐场景 (Stable)",
    },
    {
      id: "gemini-3.1-flash-lite-image",
      name: "Nano Banana 2 Lite",
      group: "Gemini 3.1",
      provider: "gemini",
      capabilities: { vision: true, imageGeneration: true, preferChat: true },
      description: "超低延迟、极具性价比的图像生成与编辑，适合高频交互 (Stable)",
    },
    {
      id: "gemini-3-pro-image",
      name: "Nano Banana Pro",
      group: "Gemini 3",
      provider: "gemini",
      capabilities: {
        vision: true,
        imageGeneration: true,
        thinking: true,
        thinkingConfigType: "switch",
        preferChat: true,
      },
      description:
        "专业设计引擎，4K 视觉、复杂布局与精确文字渲染，带推理核心 (Stable)",
    },
    // 音频与视频
    {
      id: "gemini-3.1-flash-live-preview",
      name: "Gemini 3.1 Flash Live",
      group: "Gemini 3.1",
      provider: "gemini",
      capabilities: { vision: true, audio: true, toolUse: true, webSearch: true },
      description: "高保真、低延迟的实时对话与语音优先 AI 应用模型 (Preview)",
    },
    {
      id: "gemini-3.1-flash-tts-preview",
      name: "Gemini 3.1 Flash TTS",
      group: "Gemini 3.1",
      provider: "gemini",
      capabilities: { audio: true, audioGeneration: true },
      description: "低延迟语音生成，支持可引导提示与精细语音控制 (Preview)",
    },
    {
      id: "gemini-omni-flash",
      name: "Gemini Omni Flash",
      group: "Gemini 3",
      provider: "gemini",
      capabilities: { vision: true, videoGeneration: true, preferChat: true },
      description: "快速、对话式视频生成与编辑，支持自然语言迭代 (Preview)",
    },
    // Gemini 2.5
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "先进思考模型，支持长上下文、代码、数学和STEM (2025-06)",
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
        thinking: true,
        thinkingConfigType: "budget",
      },
      description: "最佳性价比模型，适用于大规模、低延迟任务 (2025-06)",
    },
    {
      id: "gemini-2.5-flash-image",
      name: "Nano Banana (2.5)",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        imageGeneration: true,
        fileSearch: true,
        preferChat: true,
      },
      description: "原生图像生成与编辑 (2025-10)",
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash-Lite",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "超快速模型，优化成本和吞吐量 (2025-07)",
    },
  ],
};
