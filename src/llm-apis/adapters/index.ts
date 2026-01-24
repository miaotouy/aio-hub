import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, MediaGenerationOptions } from "@/llm-apis/common";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "@/llm-apis/embedding-types";
import { openAiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { anthropicAdapter } from "./anthropic";
import { vertexAiAdapter } from "./vertexai";
import { cohereAdapter } from "./cohere";
import { callSiliconFlowImageApi } from "./siliconflow/image";
import { xAiAdapter } from "./xai";

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
   * 图片生成
   */
  image?(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse>;

  /**
   * 音频生成 (TTS)
   */
  audio?(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse>;

  /**
   * 视频生成
   */
  video?(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse>;
}

/**
 * 适配器分发映射
 * 注意：在具体适配器实现完成前，这里先留空或使用占位符
 */
export const adapters: Record<string, LlmAdapter> = {
  openai: openAiAdapter,
  "openai-compatible": openAiAdapter,
  "openai-responses": openAiAdapter,
  groq: openAiAdapter,
  mistral: openAiAdapter,
  perplexity: openAiAdapter,
  deepseek: openAiAdapter,
  together: openAiAdapter,
  openrouter: openAiAdapter,
  ollama: openAiAdapter,
  lmstudio: openAiAdapter,
  vllm: openAiAdapter,
  volcengine: openAiAdapter,
  dashscope: openAiAdapter,
  zhipu: openAiAdapter,
  moonshot: openAiAdapter,
  siliconflow: {
    ...openAiAdapter,
    image: callSiliconFlowImageApi,
  },
  xai: xAiAdapter,
  gemini: geminiAdapter,
  claude: anthropicAdapter,
  vertexai: vertexAiAdapter,
  cohere: cohereAdapter,
};

export type ProviderType = keyof typeof adapters;
