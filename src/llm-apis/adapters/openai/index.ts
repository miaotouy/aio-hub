import type { LlmAdapter } from "@/llm-apis/adapters";
import { callOpenAiChatApi } from "./chat";
import { callOpenAiEmbeddingApi } from "./embedding";
import { callOpenAiImageApi } from "./image";
import { callOpenAiAudioApi } from "./audio";
import { callOpenAiVideoApi } from "./video";
import { callOpenAiResponsesApi } from "./responses";

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

/**
 * OpenAI Responses 适配器实现
 * 专门用于支持有状态对话、工具调用和 gpt-image-2 的新 API
 */
export const openAiResponsesAdapter: LlmAdapter = {
  ...openAiAdapter,
  chat: callOpenAiResponsesApi,
  image: callOpenAiResponsesApi, // Responses API 也可以直接用于图像生成
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";
export * from "./image";
export * from "./audio";
export * from "./video";
export * from "./responses";
