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

import { createChatAdapters } from "../execution/chatAdapters";
import { desktopLlmTransport } from "../transports/desktop";
import { resolveCustomHeaders } from "../../views/Settings/llm-service/config/customHeadersPresets";
import type { ProviderType as LlmProviderType } from "../../types/llm-profiles";
import { openAiAdapter, openAiResponsesAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { anthropicAdapter } from "./anthropic";
import { vertexAiAdapter } from "./vertexai";
import { cohereAdapter } from "./cohere";
import { deepSeekAdapter } from "./deepseek";
import { callSiliconFlowImageApi } from "./siliconflow/image";
import { xAiAdapter } from "./xai";
import { sunoNewApiAdapter } from "./suno-newapi";
import { minimaxMusicAdapter } from "./minimax-music";
import { azureOpenAiAdapter } from "./azure";

export type { LlmAdapter } from "./types";
import type { LlmAdapter } from "./types";

/**
 * 适配器分发映射
 * 注意：在具体适配器实现完成前，这里先留空或使用占位符
 */
const defineAdapters = <T extends Partial<Record<LlmProviderType, LlmAdapter>>>(
  value: T
): T => value;

export const adapters: Record<string, LlmAdapter | undefined> = defineAdapters({
  openai: openAiAdapter,
  "openai-compatible": openAiAdapter,
  "openai-responses": openAiResponsesAdapter,
  azure: azureOpenAiAdapter,
  groq: openAiAdapter,
  mistral: openAiAdapter,
  perplexity: openAiAdapter,
  deepseek: deepSeekAdapter,
  together: openAiAdapter,
  openrouter: openAiAdapter,
  ollama: openAiAdapter,
  lmstudio: openAiAdapter,
  vllm: openAiAdapter,
  volcengine: openAiAdapter,
  dashscope: openAiAdapter,
  zhipu: openAiAdapter,
  moonshot: openAiAdapter,
  siliconflow: {
    ...openAiAdapter,
    image: callSiliconFlowImageApi,
  },
  xai: xAiAdapter,
  gemini: geminiAdapter,
  claude: anthropicAdapter,
  vertexai: vertexAiAdapter,
  cohere: cohereAdapter,
  "suno-newapi": sunoNewApiAdapter,
  "minimax-music": minimaxMusicAdapter,
  audiocpp: openAiAdapter,
  // Aggregate channel identities. Runtime execution resolves the concrete
  // protocol first and remaps `effectiveProfile.type`, so these entries are
  // defensive fallbacks for any path that bypasses the resolver.
  "new-api": openAiAdapter,
  fireworks: openAiAdapter,
  deepinfra: openAiAdapter,
  huggingface: openAiAdapter,
  modelscope: openAiAdapter,
  vcp: openAiAdapter,
  sub2api: openAiAdapter,
  "aggregate-compatible": openAiAdapter,
  "opencode-go": openAiAdapter,
});

const chatAdapters = createChatAdapters({
  transport: desktopLlmTransport,
  resolveCustomHeaders,
});
for (const [provider, adapter] of Object.entries(chatAdapters)) {
  if (adapters[provider] && adapter)
    adapters[provider] = { ...adapters[provider], chat: adapter.chat };
}

export type ProviderType = keyof typeof adapters;
