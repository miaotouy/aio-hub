import type { LlmProfile } from '@/types/llm-profiles';
import type { EmbeddingRequestOptions, EmbeddingResponse } from './embedding-types';
import { callOpenAiEmbeddingApi } from './openai-compatible';
import { callGeminiEmbeddingApi } from './gemini';
import { callCohereEmbeddingApi } from './cohere';
import { callVertexAiEmbeddingApi } from './vertexai';

/**
 * 统一的 Embedding API 调用入口
 * 根据 profile.type 自动路由到对应的实现
 */
export async function callEmbeddingApi(
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> {
  switch (profile.type) {
    case 'openai':
      return callOpenAiEmbeddingApi(profile, options);
    
    case 'gemini':
      return callGeminiEmbeddingApi(profile, options);
    
    case 'cohere':
      return callCohereEmbeddingApi(profile, options);
    
    case 'vertexai':
      return callVertexAiEmbeddingApi(profile, options);
    
    case 'claude':
    case 'openai-responses':
      throw new Error(`Provider "${profile.type}" 不支持 Embedding API`);
    
    default:
      throw new Error(`未知的 Provider 类型: ${profile.type}`);
  }
}

// 导出类型
export type { EmbeddingRequestOptions, EmbeddingResponse, EmbeddingTaskType } from './embedding-types';