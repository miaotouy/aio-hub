import type { LlmAdapter } from "../index";
import { callCohereChatApi } from "./chat";
import { callCohereEmbeddingApi } from "./embedding";

/**
 * Cohere 适配器实现
 */
export const cohereAdapter: LlmAdapter = {
  chat: callCohereChatApi,
  embedding: callCohereEmbeddingApi,
};

export * from "./utils";
export * from "./chat";
export * from "./embedding";