import type { LlmProfile } from '@/types/llm-profiles';
import type { EmbeddingRequestOptions, EmbeddingResponse } from './embedding-types';
import { adapters } from './adapters';

/**
 * 统一的 Embedding API 调用入口
 * 根据 profile.type 自动路由到对应的实现
 */
export async function callEmbeddingApi(
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> {
  const adapter = adapters[profile.type];
  
  if (!adapter) {
    throw new Error(`未知的 Provider 类型: ${profile.type}`);
  }

  if (!adapter.embedding) {
    throw new Error(`Provider "${profile.type}" 不支持 Embedding API`);
  }

  return adapter.embedding(profile, options);
}

// 导出类型
export type { EmbeddingRequestOptions, EmbeddingResponse, EmbeddingTaskType } from './embedding-types';