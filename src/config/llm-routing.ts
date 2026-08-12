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

import type { LlmAdapterId, LlmOperation } from "@aiohub/llm-core";

/**
 * 模型执行路由的展示标签。
 *
 * 适配器 ID 表示线协议（wire protocol），不是渠道身份；未知字符串
 * （如未来新增协议）直接回退显示原始值，不在此处兜底猜测。
 */
export const ADAPTER_LABELS: Readonly<Record<LlmAdapterId, string>> = {
  "openai-chat-completions": "OpenAI Chat Completions",
  "openai-responses": "OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
  "gemini-generate-content": "Gemini GenerateContent",
  "cohere-chat": "Cohere Chat",
  "vertex-google": "Vertex AI (Google)",
  "vertex-anthropic": "Vertex AI (Anthropic)",
  "openai-embeddings": "OpenAI Embeddings",
  "jina-rerank": "Jina Rerank",
  "openai-image-generation": "OpenAI Image Generation",
  "suno-newapi": "Suno (New API)",
  "minimax-music": "MiniMax Music",
};

export const OPERATION_LABELS: Readonly<Record<LlmOperation, string>> = {
  chat: "对话",
  embedding: "Embedding",
  rerank: "Rerank",
  image: "图片",
  audio: "音频",
  video: "视频",
  music: "音乐",
};

export function getAdapterLabel(adapterId: string): string {
  return ADAPTER_LABELS[adapterId as LlmAdapterId] ?? adapterId;
}
