import type { LlmAdapter } from "../index";
import { callGeminiChatApi } from "./chat";
import { callGeminiEmbeddingApi } from "./embedding";

/**
 * Gemini 适配器实现
 */
export const geminiAdapter: LlmAdapter = {
  chat: callGeminiChatApi,
  embedding: callGeminiEmbeddingApi,
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";
