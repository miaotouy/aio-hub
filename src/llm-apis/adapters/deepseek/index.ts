import type { LlmAdapter } from "@/llm-apis/adapters";
import { callDeepSeekChatApi } from "./chat";
import { callOpenAiEmbeddingApi } from "../openai/embedding";

/**
 * DeepSeek 薄适配器：复用 OpenAI 兼容传输，隔离 DeepSeek 参数语义。
 */
export const deepSeekAdapter: LlmAdapter = {
  chat: callDeepSeekChatApi,
  embedding: callOpenAiEmbeddingApi,
};

export * from "./chat";
