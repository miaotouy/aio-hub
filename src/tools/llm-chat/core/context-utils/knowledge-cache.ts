import type { SearchResult } from "../../../knowledge-base/types/search";
import { createModuleLogger } from "@/utils/logger";
import { invoke } from "@tauri-apps/api/core";

const logger = createModuleLogger("KnowledgeCache");

export interface RetrievalCacheInput {
  query: string;
  kbIds: string[];
  tags: string[];
  limit: number;
  minScore: number;
  engineId: string;
  modelId: string;
}

export interface CachedRetrievalEntry {
  results: SearchResult[];
  vector: number[] | null;
}

export async function getRetrievalCache(
  input: RetrievalCacheInput
): Promise<CachedRetrievalEntry | null> {
  try {
    return await invoke<CachedRetrievalEntry | null>("kb_retrieval_cache_get", {
      input,
    });
  } catch (err) {
    logger.warn("读取后端检索缓存失败", { err });
    return null;
  }
}

export async function setRetrievalCache(
  input: RetrievalCacheInput,
  entry: CachedRetrievalEntry,
  maxItems: number
): Promise<void> {
  try {
    await invoke("kb_retrieval_cache_set", { input, entry, maxItems });
  } catch (err) {
    logger.warn("写入后端检索缓存失败", { err });
  }
}

export async function clearAllRetrievalCache(): Promise<void> {
  try {
    await invoke("kb_retrieval_cache_clear");
    logger.debug("已清除后端知识库检索缓存");
  } catch (err) {
    logger.warn("清空后端检索缓存失败", { err });
  }
}

export async function getRetrievalCacheStats(): Promise<number> {
  try {
    return await invoke<number>("kb_retrieval_cache_stats");
  } catch (err) {
    logger.warn("读取后端检索缓存统计失败", { err });
    return 0;
  }
}
