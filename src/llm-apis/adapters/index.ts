import type { LlmProfile } from "../../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "../common";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "../embedding-types";
import { openAiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { anthropicAdapter } from "./anthropic";
import { vertexAiAdapter } from "./vertexai";
import { cohereAdapter } from "./cohere";

/**
 * 统一适配器接口
 */
export interface LlmAdapter {
  /**
   * 文本对话/流式处理
   */
  chat(profile: LlmProfile, options: LlmRequestOptions): Promise<LlmResponse>;

  /**
   * 向量嵌入 (可选)
   */
  embedding?(profile: LlmProfile, options: EmbeddingRequestOptions): Promise<EmbeddingResponse>;

  /**
   * 图片生成 (未来扩展)
   */
  // generateImage?(profile: LlmProfile, options: any): Promise<any>;
}

/**
 * 适配器分发映射
 * 注意：在具体适配器实现完成前，这里先留空或使用占位符
 */
export const adapters: Record<string, LlmAdapter> = {
  openai: openAiAdapter,
  "openai-responses": openAiAdapter,
  gemini: geminiAdapter,
  claude: anthropicAdapter,
  vertexai: vertexAiAdapter,
  cohere: cohereAdapter,
};

export type ProviderType = keyof typeof adapters;
