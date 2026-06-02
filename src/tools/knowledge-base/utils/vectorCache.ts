import { adapters } from "@/llm-apis/adapters";
import { createModuleLogger } from "@/utils/logger";
import { createConfigManager } from "@/utils/configManager";
import { invoke } from "@tauri-apps/api/core";

const logger = createModuleLogger("knowledge-base/vector-cache");

/**
 * Embedding 缓存默认容量（仅在 store 尚未初始化时作为兜底使用）
 */
const FALLBACK_EMBEDDING_CACHE_MAX = 500;

/**
 * Lazy 读取后端 Embedding 缓存的最大容量
 *
 * vectorCacheManager 是模块级单例，初始化时机早于 pinia store。
 * 因此每次写入缓存时才动态尝试读取 store 的配置，无法读到时使用兜底值。
 */
async function resolveEmbeddingCacheMaxItems(): Promise<number> {
  try {
    // 动态 import 避免模块级循环依赖
    const { useKnowledgeBaseStore } =
      await import("../stores/knowledgeBaseStore");
    const store = useKnowledgeBaseStore();
    const max = store.config?.cache?.embeddingCacheMaxItems;
    if (typeof max === "number" && max > 0) return max;
  } catch {
    // store 未初始化或异常，走兜底
  }
  return FALLBACK_EMBEDDING_CACHE_MAX;
}

/**
 * SHA-256 哈希辅助函数
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 向量 KV 缓存管理器
 * 用于在知识库全局复用相同模型对相同查询生成的向量
 */
export class VectorCacheManager {
  /**
   * 内存缓存
   * Key: 哈希后的 `${modelId}:${query}`
   */
  private cache = new Map<string, number[]>();

  private configManager = createConfigManager<Record<string, number[]>>({
    moduleName: "knowledge",
    fileName: "vector_cache.json",
    createDefault: () => ({}),
  });

  private initialized = false;

  /**
   * 初始化加载持久化缓存
   */
  private async ensureInitialized() {
    if (this.initialized) return;
    try {
      const savedCache = await this.configManager.load();
      Object.entries(savedCache).forEach(([key, vector]) => {
        this.cache.set(key, vector);
      });
      this.initialized = true;
      logger.info("已从持久化存储加载向量缓存", { count: this.cache.size });
    } catch (e) {
      logger.warn("加载持久化向量缓存失败", e);
      this.initialized = true; // 失败也标记为已初始化，避免循环
    }
  }

  /**
   * 获取查询向量（带缓存管理）
   */
  async getVector(
    query: string,
    profile: any,
    modelId: string
  ): Promise<number[]> {
    await this.ensureInitialized();

    const rawKey = `${modelId}:${query}`;
    const cacheKey = await sha256(rawKey);

    if (this.cache.has(cacheKey)) {
      logger.debug("命中向量内存缓存", {
        modelId,
        query: query.substring(0, 20) + "...",
        hash: cacheKey,
      });
      return this.cache.get(cacheKey)!;
    }

    // 2. 尝试二级缓存 (Rust 后端，跨窗口共享)
    try {
      const remoteVector = await invoke<number[] | null>(
        "kb_get_embedding_cache",
        {
          modelId,
          text: query,
        }
      );

      if (remoteVector) {
        logger.debug("命中向量后端缓存", {
          modelId,
          query: query.substring(0, 20) + "...",
        });
        this.cache.set(cacheKey, remoteVector);
        return remoteVector;
      }
    } catch (error) {
      logger.warn("从 Rust 后端获取 Embedding 缓存失败", error);
    }

    const adapter = adapters[profile.type];
    if (!adapter || !adapter.embedding) {
      throw new Error(`模型提供商 ${profile.type} 不支持 Embedding`);
    }

    logger.info("生成查询向量", {
      modelId,
      query: query.substring(0, 20) + "...",
    });
    const startTime = Date.now();
    const response = await adapter.embedding(profile, {
      modelId: modelId,
      input: query,
    });
    const duration = Date.now() - startTime;

    const vector = response.data?.[0]?.embedding;
    if (vector) {
      logger.info("查询向量生成成功", {
        modelId,
        dimension: vector.length,
        duration: `${duration}ms`,
      });
    }
    if (!vector) {
      throw new Error("获取向量为空");
    }

    this.cache.set(cacheKey, vector);

    // 同步到后端缓存
    try {
      const maxItems = await resolveEmbeddingCacheMaxItems();
      await invoke("kb_set_embedding_cache", {
        modelId,
        text: query,
        vector,
        maxItems,
      });
    } catch (error) {
      logger.warn("保存 Embedding 缓存到后端失败", error);
    }

    return vector;
  }

  /**
   * 清除缓存
   */
  clear() {
    this.cache.clear();
    logger.info("向量缓存已清空");
  }

  /**
   * 获取缓存大小
   */
  get size() {
    return this.cache.size;
  }
}

// 导出单例，实现在知识库全局可用
export const vectorCacheManager = new VectorCacheManager();
