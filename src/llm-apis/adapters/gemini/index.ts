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
import { callGeminiChatApi } from "./chat";
import { callGeminiEmbeddingApi } from "./embedding";
import { callGeminiImageApi } from "./image";
import { callGeminiVideoApi } from "./video";

/**
 * Gemini 适配器实现
 */
export const geminiAdapter: LlmAdapter = {
  chat: callGeminiChatApi,
  embedding: callGeminiEmbeddingApi,
  image: callGeminiImageApi,
  audio: callGeminiChatApi as unknown as LlmAdapter["audio"], // Gemini 语音生成复用对话接口
  video: callGeminiVideoApi,
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";
export * from "./image";
export * from "./video";
