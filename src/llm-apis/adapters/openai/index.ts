import type { LlmAdapter } from "@/llm-apis/adapters";
import { callOpenAiChatApi } from "./chat";
import { callOpenAiEmbeddingApi } from "./embedding";
import { callOpenAiImageApi } from "./image";
import { callOpenAiAudioApi } from "./audio";
import { callOpenAiVideoApi } from "./video";

/**
 * OpenAI 适配器实现
 */
export const openAiAdapter: LlmAdapter = {
  chat: callOpenAiChatApi,
  embedding: callOpenAiEmbeddingApi,
  image: callOpenAiImageApi,
  audio: callOpenAiAudioApi,
  video: callOpenAiVideoApi,
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";
export * from "./image";
export * from "./audio";
export * from "./video";
export * from "./responses";
