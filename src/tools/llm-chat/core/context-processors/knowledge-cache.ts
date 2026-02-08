import type { SearchResult } from "../../../knowledge-base/types/search";
import { createModuleLogger } from "@/utils/logger";
import { invoke } from "@tauri-apps/api/core";

const logger = createModuleLogger("KnowledgeCache");

/**
 * 向量缓存条目
 */
interface EmbeddingCacheEntry {
  vector: number[];
  timestamp: number;
}

/**
 * Embedding 向量缓存类 (跨窗口共享)
 * 采用两级缓存机制：
 * 1. 窗口本地 Map (一级缓存，极速)
 * 2. Rust 后端全局单例 (二级缓存，跨窗口/WebView 共享，节约 API 成本)
 */
export class EmbeddingCache {
  private localCache = new Map<string, EmbeddingCacheEntry>();
  private maxItems: number;

  constructor(maxItems = 100) {
    this.maxItems = maxItems;
  }

  /**
   * 获取向量
   * 优先查本地，再查 Rust 后端
   */
  async get(modelId: string, text: string): Promise<number[] | null> {
    const key = `${modelId}:${text}`;

    // 1. 尝试一级缓存 (本地内存)
    const entry = this.localCache.get(key);
    if (entry) {
      // 命中缓存，更新顺序 (LRU)
      this.localCache.delete(key);
      this.localCache.set(key, { ...entry, timestamp: Date.now() });
      return entry.vector;
    }

    // 2. 尝试二级缓存 (Rust 后端)
    try {
      const remoteVector = await invoke<number[] | null>("kb_get_embedding_cache", {
        modelId,
        text,
      });

      if (remoteVector) {
        // 回填到本地缓存
        this.setLocal(key, remoteVector, this.maxItems);
        return remoteVector;
      }
    } catch (error) {
      logger.warn("从 Rust 后端获取 Embedding 缓存失败", error);
    }

    return null;
  }

  /**
   * 设置向量
   * 同步更新本地和 Rust 后端
   */
  async set(modelId: string, text: string, vector: number[], maxItems?: number): Promise<void> {
    const key = `${modelId}:${text}`;
    if (maxItems !== undefined) {
      this.maxItems = maxItems;
    }

    // 1. 更新本地
    this.setLocal(key, vector, this.maxItems);

    // 2. 更新 Rust 后端
    try {
      await invoke("kb_set_embedding_cache", {
        modelId,
        text,
        vector,
        maxItems: this.maxItems,
      });
    } catch (error) {
      logger.warn("保存 Embedding 缓存到 Rust 后端失败", error);
    }
  }

  private setLocal(key: string, vector: number[], maxItems: number): void {
    if (this.localCache.size >= maxItems) {
      // 简单的 LRU: 删除第一个 (Map 保持插入顺序)
      const firstKey = this.localCache.keys().next().value;
      if (firstKey !== undefined) this.localCache.delete(firstKey);
    }
    this.localCache.set(key, { vector, timestamp: Date.now() });
  }

  /** 更新最大容量 */
  updateMaxItems(maxItems: number): void {
    this.maxItems = maxItems;
  }

  get size(): number {
    return this.localCache.size;
  }

  async clear(): Promise<void> {
    this.localCache.clear();
    try {
      await invoke("kb_clear_embedding_cache");
    } catch (e) {
      // ignore
    }
  }
}

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
// 导致 EmbeddingCache / KBSessionCache 在两条连续消息之间就会丢失。
//
// 新设计：
// - EmbeddingCache: 全局单例（同一文本的向量与会话无关）
// - KBSessionCache + TurnRecord[]: 按 sessionId 隔离
//
// 生命周期：
// - 存活于 JS 内存中，应用窗口关闭/刷新时丢失（Tauri 桌面端正常使用不会刷新）
// - 会话删除时应调用 clearSessionCache() 释放对应缓存
// ============================================================

/** 全局 Embedding 向量缓存（跨会话共享） */
let globalEmbeddingCache: EmbeddingCache | null = null;

/** 按 sessionId 隔离的会话级缓存 */
interface SessionCacheData {
  retrievalCache: KBSessionCache;
  history: TurnRecord[];
}
const sessionCaches = new Map<string, SessionCacheData>();

/**
 * 获取全局 Embedding 缓存（懒初始化）
 */
export function getGlobalEmbeddingCache(maxItems = 100): EmbeddingCache {
  if (!globalEmbeddingCache) {
    globalEmbeddingCache = new EmbeddingCache(maxItems);
    logger.debug("创建全局 Embedding 缓存", { maxItems });
  } else {
    globalEmbeddingCache.updateMaxItems(maxItems);
  }
  return globalEmbeddingCache;
}

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
  await globalEmbeddingCache?.clear();
  globalEmbeddingCache = null;
  sessionCaches.clear();
  logger.debug("已清除所有知识库缓存");
}

/**
 * 获取缓存统计信息（调试用）
 */
export function getCacheStats(): {
  embeddingCacheSize: number;
  sessionCount: number;
  sessions: Array<{ sessionId: string; retrievalCacheSize: number; historySize: number }>;
} {
  return {
    embeddingCacheSize: globalEmbeddingCache?.size ?? 0,
    sessionCount: sessionCaches.size,
    sessions: Array.from(sessionCaches.entries()).map(([id, data]) => ({
      sessionId: id,
      retrievalCacheSize: data.retrievalCache.size,
      historySize: data.history.length,
    })),
  };
}
