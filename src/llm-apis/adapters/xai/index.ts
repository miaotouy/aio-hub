import type { LlmAdapter } from "@/llm-apis/adapters";
import { callOpenAiChatApi } from "../openai/chat";
import { callXAiImageApi } from "./image";

/**
 * xAI (Grok) 适配器实现
 * 目前主要兼容 OpenAI 接口，但针对特定模型做了参数过滤
 */
export const xAiAdapter: LlmAdapter = {
  chat: callOpenAiChatApi,
  image: callXAiImageApi,
};