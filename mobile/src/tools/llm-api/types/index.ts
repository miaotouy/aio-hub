/**
 * LLM 基础类型定义出口
 */

export * from "./common";
export * from "./model-metadata";
import type { LlmModelInfo } from "./common";
import type { ProviderType as SharedProviderType } from "@/../../src/types/llm-profiles";

export type ProviderType = SharedProviderType;

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


import type { LlmProfile as SharedLlmProfile } from "@/../../src/types/llm-profiles";

export interface LlmProfile extends Omit<SharedLlmProfile, 'models' | 'modelGroupsExpandState'> {
  models: LlmModelInfo[];
  modelGroupsExpandState?: string[];
}
