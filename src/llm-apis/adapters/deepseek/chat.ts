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

import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { callOpenAiChatApi } from "../openai/chat";

const DEEPSEEK_REASONING_EFFORT_MAP: Record<string, string> = {
  medium: "high",
  xhigh: "high",
};

function normalizeDeepSeekChatOptions(
  options: LlmRequestOptions
): LlmRequestOptions {
  const reasoningEffort = options.reasoningEffort?.trim().toLowerCase();

  return {
    ...options,
    reasoningEffort: reasoningEffort
      ? (DEEPSEEK_REASONING_EFFORT_MAP[reasoningEffort] ?? reasoningEffort)
      : undefined,
  };
}

/**
 * DeepSeek 使用 OpenAI 兼容协议，但推理/思考参数语义不等同于 OpenAI。
 * 思考参数是否参与请求由选中模型的 capabilities 决定；这里仅归一化
 * DeepSeek 官方实际接受的 reasoning_effort 值，再复用 OpenAI Chat 的传输与解析逻辑。
 */
export async function callDeepSeekChatApi(
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> {
  return callOpenAiChatApi(profile, normalizeDeepSeekChatOptions(options));
}
