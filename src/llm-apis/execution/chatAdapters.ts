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

import type { LlmAdapter } from "../adapters/types";
import type { ChatAdapterPorts } from "./chatAdapterPorts";
import { executeOpenAiChat } from "../adapters/openai/chat-executor";
import { executeOpenAiResponses } from "../adapters/openai/responses-executor";
import { executeGeminiChat } from "../adapters/gemini/chat-executor";
import { executeClaudeChat } from "../adapters/anthropic/chat-executor";
import { executeCohereChat } from "../adapters/cohere/chat-executor";
import { executeVertexAiGemini } from "../adapters/vertexai/google-executor";
import { executeVertexAiClaude } from "../adapters/vertexai/anthropic-executor";
import { detectPublisher } from "../adapters/vertexai/utils";
import { prepareAzureOpenAiProfile } from "../adapters/azure/utils";
import { normalizeDeepSeekChatOptions } from "../adapters/deepseek/chat-options";
import { createOpenAiHeaders } from "../adapters/openai/headers";

export function createChatAdapters(
  ports: ChatAdapterPorts
): Record<string, LlmAdapter | undefined> {
  const openai: LlmAdapter = {
    chat: (profile, options) =>
      executeOpenAiChat(profile, options, {
        transport: ports.transport,
        buildHeaders: (value, id) =>
          createOpenAiHeaders(value, id, ports.resolveCustomHeaders),
      }),
  };
  const adapters: Record<string, LlmAdapter | undefined> = Object.fromEntries(
    [
      "openai",
      "openai-compatible",
      "groq",
      "mistral",
      "perplexity",
      "together",
      "openrouter",
      "ollama",
      "lmstudio",
      "vllm",
      "volcengine",
      "dashscope",
      "zhipu",
      "moonshot",
      "siliconflow",
      "xai",
      "audiocpp",
      "new-api",
      "fireworks",
      "deepinfra",
      "huggingface",
      "modelscope",
      "vcp",
      "sub2api",
      "aggregate-compatible",
      "opencode-go",
    ].map((provider) => [provider, openai])
  );
  adapters["openai-responses"] = {
    chat: (profile, options) => executeOpenAiResponses(profile, options, ports),
  };
  adapters.gemini = {
    chat: (profile, options) => executeGeminiChat(profile, options, ports),
  };
  adapters.claude = {
    chat: (profile, options) => executeClaudeChat(profile, options, ports),
  };
  adapters.cohere = {
    chat: (profile, options) => executeCohereChat(profile, options, ports),
  };
  adapters.azure = {
    chat: (profile, options) =>
      openai.chat(prepareAzureOpenAiProfile(profile, "chat"), options),
  };
  adapters.deepseek = {
    chat: (profile, options) =>
      openai.chat(profile, normalizeDeepSeekChatOptions(options)),
  };
  adapters.vertexai = {
    chat: (profile, options) =>
      detectPublisher(options.modelId) === "google"
        ? executeVertexAiGemini(profile, options, ports)
        : executeVertexAiClaude(profile, options, ports),
  };
  return adapters;
}
