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
        "最智能 Flash 系列，强 agentic & coding 能力，1M 上下文 (2026-05 GA)",
    },
    // Gemini 3
    {
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro",
      group: "Gemini 3",
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
        "旗舰多模态模型，支持文本、图像、视频、音频、PDF输入 (2025-11)",
    },
    {
      id: "gemini-3-pro-image-preview",
      name: "Gemini 3 Pro Image",
      group: "Gemini 3",
      provider: "gemini",
      capabilities: { vision: true, imageGeneration: true, preferChat: true },
      description: "图像生成和理解模型 (2025-11)",
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
      id: "gemini-2.5-pro-preview-tts",
      name: "Gemini 2.5 Pro TTS",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: { audio: true, fileSearch: true },
      description: "文本转语音模型 (2025-05)",
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
      id: "gemini-2.5-flash-preview-09-2025",
      name: "Gemini 2.5 Flash Preview",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "Flash 的预览版本 (2025-09)",
    },
    {
      id: "gemini-2.5-flash-image",
      name: "Gemini 2.5 Flash Image",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        imageGeneration: true,
        fileSearch: true,
        preferChat: true,
      },
      description: "Flash 系列的图像生成模型 (2025-10)",
    },
    {
      id: "gemini-2.5-flash-native-audio-preview-09-2025",
      name: "Gemini 2.5 Flash Live",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        fileSearch: true,
        webSearch: true,
      },
      description: "实时音频和视频交互模型 (2025-09)",
    },
    {
      id: "gemini-2.5-flash-preview-tts",
      name: "Gemini 2.5 Flash TTS",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: { audio: true, fileSearch: true },
      description: "Flash 系列的文本转语音模型 (2025-05)",
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
    {
      id: "gemini-2.5-flash-lite-preview-09-2025",
      name: "Gemini 2.5 Flash-Lite Preview",
      group: "Gemini 2.5",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "Flash-Lite 的预览版本 (2025-09)",
    },
    // Gemini 2.0
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      group: "Gemini 2.0",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "第二代主力模型，1M上下文 (2025-02)",
    },
    {
      id: "gemini-2.0-flash-preview-image-generation",
      name: "Gemini 2.0 Flash Image",
      group: "Gemini 2.0",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        imageGeneration: true,
        preferChat: true,
      },
      description: "第二代图像生成模型 (2025-05)",
    },
    {
      id: "gemini-2.0-flash-live-001",
      name: "Gemini 2.0 Flash Live",
      group: "Gemini 2.0",
      provider: "gemini",
      capabilities: {
        vision: true,
        audio: true,
        toolUse: true,
        webSearch: true,
        codeExecution: true,
      },
      description: "第二代实时交互模型，将于2025-12-09弃用 (2025-04)",
    },
    {
      id: "gemini-2.0-flash-lite",
      name: "Gemini 2.0 Flash-Lite",
      group: "Gemini 2.0",
      provider: "gemini",
      capabilities: { vision: true, audio: true, toolUse: true },
      description: "第二代小型主力模型，1M上下文 (2025-02)",
    },
  ],
};
