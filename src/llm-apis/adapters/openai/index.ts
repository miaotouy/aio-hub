import type { LlmAdapter } from "../index";
import { callOpenAiChatApi } from "./chat";
import { callOpenAiEmbeddingApi } from "./embedding";

/**
 * OpenAI 适配器实现
 */
export const openAiAdapter: LlmAdapter = {
  chat: callOpenAiChatApi,
  embedding: callOpenAiEmbeddingApi,
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";
export * from "./responses";
