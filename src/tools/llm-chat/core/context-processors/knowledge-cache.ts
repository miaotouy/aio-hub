import type { SearchResult } from "../../../knowledge-base/types/search";

/**
 * 向量缓存条目
 */
interface EmbeddingCacheEntry {
  vector: number[];
  timestamp: number;
}

/**
 * Embedding 向量缓存类
 */
export class EmbeddingCache {
  private cache = new Map<string, EmbeddingCacheEntry>();
  private readonly maxItems: number;

  constructor(maxItems = 100) {
    this.maxItems = maxItems;
  }

  get(text: string): number[] | null {
    const entry = this.cache.get(text);
    if (entry) {
      return entry.vector;
    }
    return null;
  }

  set(text: string, vector: number[]): void {
    if (this.cache.size >= this.maxItems) {
      // 简单的 LRU: 删除第一个
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(text, { vector, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
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
  private readonly maxItems: number;

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
    return this.cache.find(e => e.query === text) || null;
  }

  add(entry: RetrievalCacheEntry): void {
    if (this.cache.length >= this.maxItems) {
      this.cache.shift();
    }
    this.cache.push(entry);
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