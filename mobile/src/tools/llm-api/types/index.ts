/**
 * LLM 基础类型定义出口
 */

export * from "./common";
export * from "./model-metadata";
import type { LlmModelInfo } from "./common";

export type ProviderType =
  | "openai"
  | "openai-responses"
  | "gemini"
  | "claude"
  | "cohere"
  | "huggingface"
  | "vertexai";

export interface LlmParameterSupport {
  temperature?: boolean;
  maxTokens?: boolean;
  topP?: boolean;
  topK?: boolean;
  frequencyPenalty?: boolean;
  presencePenalty?: boolean;
  seed?: boolean;
  stop?: boolean;
  maxCompletionTokens?: boolean;
  reasoningEffort?: boolean;
  logprobs?: boolean;
  topLogprobs?: boolean;
  responseFormat?: boolean;
  tools?: boolean;
  toolChoice?: boolean;
  parallelToolCalls?: boolean;
  thinking?: boolean;
  thinkingConfig?: boolean;
  thinkingLevel?: boolean;
  webSearch?: boolean;
}


export interface LlmProfile {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKeys: string[];
  enabled: boolean;
  models: LlmModelInfo[];
  icon?: string;
  customHeaders?: Record<string, string>;
  modelGroupsExpandState?: string[];
  /**
   * 自定义 API 端点（可选）
   */
  customEndpoints?: {
    chatCompletions?: string;
    completions?: string;
    models?: string;
    embeddings?: string;
    rerank?: string;
    imagesGenerations?: string;
    imagesEdits?: string;
    imagesVariations?: string;
    audioSpeech?: string;
    audioTranscriptions?: string;
    audioTranslations?: string;
    moderations?: string;
    videos?: string;
    videoStatus?: string;
  };
}
