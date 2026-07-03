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

import type { LlmAdapter } from "@/llm-apis/adapters";
import { callOpenAiChatApi } from "./chat";
import { callOpenAiEmbeddingApi } from "./embedding";
import { callOpenAiImageApi } from "./image";
import { callOpenAiAudioApi } from "./audio";
import { callOpenAiVideoApi } from "./video";
import { callOpenAiResponsesApi } from "./responses";

/**
 * OpenAI 适配器实现
 */
export const openAiAdapter: LlmAdapter = {
  chat: callOpenAiChatApi,
  embedding: callOpenAiEmbeddingApi,
  image: callOpenAiImageApi,
  audio: callOpenAiAudioApi,
  video: callOpenAiVideoApi,
};

/**
 * OpenAI Responses 适配器实现
 * 专门用于支持有状态对话、工具调用和 gpt-image-2 的新 API
 */
export const openAiResponsesAdapter: LlmAdapter = {
  ...openAiAdapter,
  chat: callOpenAiResponsesApi,
  image: callOpenAiResponsesApi, // Responses API 也可以直接用于图像生成
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";
export * from "./image";
export * from "./audio";
export * from "./video";
export * from "./responses";
