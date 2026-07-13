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
import { callOpenAiChatApi } from "../openai/chat";
import { callXAiImageApi } from "./image";

/**
 * xAI (Grok) 适配器实现
 * 目前主要兼容 OpenAI 接口，但针对特定模型做了参数过滤
 */
export const xAiAdapter: LlmAdapter = {
  chat: callOpenAiChatApi,
  image: callXAiImageApi,
};
