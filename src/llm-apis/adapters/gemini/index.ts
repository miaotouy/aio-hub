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
