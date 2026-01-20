import type { LlmAdapter } from "@/llm-apis/adapters";
import { callClaudeChatApi } from "./chat";

/**
 * Anthropic 适配器实现
 */
export const anthropicAdapter: LlmAdapter = {
  chat: callClaudeChatApi,
};

export * from "./utils";
export * from "./chat";
