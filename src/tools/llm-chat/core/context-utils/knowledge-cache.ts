import type { SearchResult } from "../../../knowledge-base/types/search";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("KnowledgeCache");


/**
 * 检索结果缓存条目
 */
export interface RetrievalCacheEntry {
  query: string;
  vector?: number[];
  results: SearchResult[];
  timestamp: number;
}

/**
 * 知识库会话缓存类
 */
export class KBSessionCache {
  private cache: RetrievalCacheEntry[] = [];
  private maxItems: number;

  constructor(maxItems = 20) {
    this.maxItems = maxItems;
  }

  /**
   * 查找相似的缓存条目
   */
  findSimilar(vector: number[], threshold: number): RetrievalCacheEntry | null {
    if (!vector || vector.length === 0) return null;

    for (const entry of this.cache) {
      if (entry.vector && entry.vector.length === vector.length) {
        const sim = this.cosineSimilarity(vector, entry.vector);
        if (sim >= threshold) {
          return entry;
        }
      }
    }
    return null;
  }

  /**
   * 按文本查找缓存
   */
  findByText(text: string): RetrievalCacheEntry | null {
    return this.cache.find((e) => e.query === text) || null;
  }

  add(entry: RetrievalCacheEntry): void {
    if (this.cache.length >= this.maxItems) {
      this.cache.shift();
    }
    this.cache.push(entry);
  }

  /** 更新最大容量 */
  updateMaxItems(maxItems: number): void {
    this.maxItems = maxItems;
  }

  get size(): number {
    return this.cache.length;
  }

  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  clear(): void {
    this.cache = [];
  }
}

/**
 * 轮次记录，用于结果聚合
 */
export interface TurnRecord {
  results: SearchResult[];
  timestamp: number;
  query: string;
  queryVector?: number[];
}

// ============================================================
// 模块级缓存管理器
// ============================================================
// 解决原有设计缺陷：PipelineContext.sharedData 在每次请求时都会重建为空 Map，
// 导致 KBSessionCache 在两条连续消息之间就会丢失。
//
// 设计：
// - Embedding 向量缓存: 委托给 vectorCacheManager（知识库模块统一管理）
// - KBSessionCache + TurnRecord[]: 按 sessionId 隔离
//
// 生命周期：
// - 存活于 JS 内存中，应用窗口关闭/刷新时丢失（Tauri 桌面端正常使用不会刷新）
// - 会话删除时应调用 clearSessionCache() 释放对应缓存
// ============================================================

/** 按 sessionId 隔离的会话级缓存 */
interface SessionCacheData {
  retrievalCache: KBSessionCache;
  history: TurnRecord[];
}
const sessionCaches = new Map<string, SessionCacheData>();


/**
 * 获取指定会话的检索缓存（懒初始化）
 */
export function getSessionRetrievalCache(sessionId: string, maxItems = 20): KBSessionCache {
  let data = sessionCaches.get(sessionId);
  if (!data) {
    data = {
      retrievalCache: new KBSessionCache(maxItems),
      history: [],
    };
    sessionCaches.set(sessionId, data);
    logger.debug("创建会话检索缓存", { sessionId, maxItems });
  } else {
    data.retrievalCache.updateMaxItems(maxItems);
  }
  return data.retrievalCache;
}

/**
 * 获取指定会话的知识库历史记录（懒初始化）
 */
export function getSessionHistory(sessionId: string): TurnRecord[] {
  let data = sessionCaches.get(sessionId);
  if (!data) {
    data = {
      retrievalCache: new KBSessionCache(),
      history: [],
    };
    sessionCaches.set(sessionId, data);
  }
  return data.history;
}

/**
 * 清除指定会话的缓存（会话删除时调用）
 */
export function clearSessionCache(sessionId: string): void {
  if (sessionCaches.delete(sessionId)) {
    logger.debug("已清除会话缓存", { sessionId });
  }
}

/**
 * 清除所有缓存（全局重置）
 */
export async function clearAllCaches(): Promise<void> {
  sessionCaches.clear();
  logger.debug("已清除所有知识库缓存");
}

/**
 * 获取缓存统计信息（调试用）
 */
export function getCacheStats(): {
  sessionCount: number;
  sessions: Array<{ sessionId: string; retrievalCacheSize: number; historySize: number }>;
} {
  return {
    sessionCount: sessionCaches.size,
    sessions: Array.from(sessionCaches.entries()).map(([id, data]) => ({
      sessionId: id,
      retrievalCacheSize: data.retrievalCache.size,
      historySize: data.history.length,
    })),
  };
}
