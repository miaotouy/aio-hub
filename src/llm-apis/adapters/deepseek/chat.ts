import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { callOpenAiChatApi } from "../openai/chat";

function normalizeDeepSeekChatOptions(
  options: LlmRequestOptions
): LlmRequestOptions {
  return {
    ...options,
    reasoningEffort: undefined,
  };
}

/**
 * DeepSeek 使用 OpenAI 兼容协议，但推理/思考参数语义不等同于 OpenAI。
 * 这里先做 DeepSeek 专属归一化，再复用 OpenAI Chat 的传输与解析逻辑。
 */
export async function callDeepSeekChatApi(
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> {
  return callOpenAiChatApi(profile, normalizeDeepSeekChatOptions(options));
}
