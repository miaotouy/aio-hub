import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { callEmbeddingApi } from "@/llm-apis/embedding";
import type { LlmProfile } from "@/types/llm-profiles";
import type { Caiu, KnowledgeRequestSettings, SearchFilters } from "../types";
import { getPureModelId } from "../utils/kbUtils";

const logger = createModuleLogger("kb-indexer-core");

/**
 * 通用带重试的请求执行器
 */
export async function executeWithRetry<T>(
  task: () => Promise<T>,
  options: {
    requestSettings?: KnowledgeRequestSettings;
    label?: string;
    onRetry?: (attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const { requestSettings, label = "Task", onRetry } = options;
  const maxRetries = requestSettings?.maxRetries ?? 2;
  const retryInterval = requestSettings?.retryInterval ?? 3000;
  const timeout = requestSettings?.timeout ?? 60000;
  const retryMode = requestSettings?.retryMode ?? "fixed";

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay =
          retryMode === "exponential" ? retryInterval * Math.pow(2, attempt - 1) : retryInterval;
        onRetry?.(attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await Promise.race([
        task(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} 请求超时`)), timeout)
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
    }
  }

  throw lastError || new Error(`${label} 失败`);
}

/**
 * 同步全局标签池
 */
export async function syncGlobalTags(params: {
  tags: string[];
  comboId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
  onProgress?: (processed: number) => void;
  shouldStop?: () => boolean;
}) {
  const { tags, comboId, profile, requestSettings, onProgress, shouldStop } = params;
  if (tags.length === 0) return;

  const modelId = getPureModelId(comboId);

  // 1. 询问后端哪些标签缺失向量
  const missingTags = await invoke<string[]>("kb_get_missing_tags", {
    modelId: modelId,
    tags,
  });

  if (missingTags.length === 0) return;

  logger.info(`同步全局标签池，发现 ${missingTags.length} 个新标签`, { modelId });

  // 2. 批量请求 Embedding (分批处理，支持并发)
  const batchSize = requestSettings?.batchSize ?? 20;
  const maxConcurrent = requestSettings?.maxConcurrent ?? 3;
  const tagVectorPairs: [string, number[]][] = [];

  const batches: string[][] = [];
  for (let i = 0; i < missingTags.length; i += batchSize) {
    batches.push(missingTags.slice(i, i + batchSize));
  }

  // 使用并发队列处理 batches
  const queue = [...batches];
  const workers = Array(Math.min(maxConcurrent, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        if (shouldStop?.()) break;
        const batch = queue.shift();
        if (!batch) break;

        try {
          // 尝试批量调用
          const response = await executeWithRetry(
            () =>
              callEmbeddingApi(profile, {
                modelId,
                input: batch,
              }),
            {
              requestSettings,
              label: "标签向量化",
            }
          );

          if (response.data) {
            response.data.forEach((item, index) => {
              tagVectorPairs.push([batch[index], item.embedding]);
            });
            onProgress?.(batch.length);
          }
        } catch (error: any) {
          // 如果报错且是批量请求，尝试降级为单条并行处理
          // 常见的报错包含 "input must be a string" 或 400 错误
          const errorMsg = error?.message || "";
          if (batch.length > 1 && (errorMsg.includes("400") || errorMsg.includes("input"))) {
            logger.warn("端点可能不支持批量 Embedding，降级为单条处理", {
              modelId,
              error: errorMsg,
            });

            // 并行处理当前 batch 中的每一条
            for (const text of batch) {
              if (shouldStop?.()) break;
              const res = await executeWithRetry(
                () => callEmbeddingApi(profile, { modelId, input: text }),
                { requestSettings, label: `标签向量化-${text}` }
              );
              if (res.data?.[0]) {
                tagVectorPairs.push([text, res.data[0].embedding]);
                onProgress?.(1);
              }
            }
          } else {
            // 其他错误正常抛出
            throw error;
          }
        }
      }
    });

  await Promise.all(workers);

  // 3. 同步回后端全局池
  if (tagVectorPairs.length > 0) {
    await invoke("kb_sync_tag_vectors", {
      modelId: modelId,
      data: tagVectorPairs,
    });

    // 4. 批量同步完成后，触发索引重建
    await invoke("kb_rebuild_tag_pool_index", {
      modelId: modelId,
    });

    logger.info(`标签池索引重建完成`, { modelId: modelId, count: tagVectorPairs.length });
  }
}

/**
 * 向量化单个条目逻辑 (不依赖 Store)
 */
export async function performIndexEntry(params: {
  kbId: string;
  entry: Caiu;
  comboId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
}) {
  const { kbId, entry, comboId, profile, requestSettings } = params;
  const modelId = getPureModelId(comboId);

  // 1. 提取并同步条目中的标签
  const entryTags = (entry.tags || [])
    .map((t) => (typeof t === "string" ? t : t.name))
    .filter(Boolean);

  await syncGlobalTags({
    tags: entryTags,
    comboId,
    profile,
    requestSettings,
  });

  logger.info("开始向量化条目内容", { entryId: entry.id, modelId });

  // 2. 获取内容向量 (使用通用重试逻辑)
  const response = await executeWithRetry(
    () =>
      callEmbeddingApi(profile, {
        modelId,
        input: entry.content,
      }),
    {
      requestSettings,
      label: "内容向量化",
      onRetry: (attempt, delay) => {
        logger.info(
          `重试向量化 (${attempt}/${requestSettings?.maxRetries ?? 2})，等待 ${delay}ms`,
          {
            entryId: entry.id,
          }
        );
      },
    }
  );

  const vector = response.data?.[0]?.embedding;
  if (!vector) throw new Error("模型未返回向量数据");

  // 3. 同步给后端，附带 token 消耗
  const tokens = response.usage?.promptTokens;
  await invoke("kb_update_entry_vector", {
    kbId,
    caiuId: entry.id,
    vector,
    model: modelId,
    tokens: tokens ?? undefined,
  });

  logger.info("条目向量化同步完成", { entryId: entry.id, tokens });

  return {
    vectorStatus: "ready" as const,
  };
}

/**
 * 批量向量化条目逻辑
 */
export async function syncEntriesVectors(params: {
  kbId: string;
  entries: Caiu[];
  comboId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
  onProgress?: (processed: number, failed?: { id: string; reason: string }[]) => void;
  shouldStop?: () => boolean;
}) {
  const { kbId, entries, comboId, profile, requestSettings, onProgress, shouldStop } = params;
  if (entries.length === 0) return;

  const modelId = getPureModelId(comboId);
  const batchSize = requestSettings?.batchSize ?? 16;
  const maxConcurrent = requestSettings?.maxConcurrent ?? 5;
  const maxContentLength = requestSettings?.maxContentLength ?? 12000;

  // 1. 过滤并预检查
  const validEntries: Caiu[] = [];
  const failedList: { id: string; reason: string }[] = [];

  for (const entry of entries) {
    if (!entry.content || entry.content.trim().length === 0) {
      failedList.push({ id: entry.id, reason: "内容为空" });
      continue;
    }
    if (entry.content.length > maxContentLength) {
      failedList.push({
        id: entry.id,
        reason: `内容过长 (${entry.content.length} 字符)，建议分段处理`,
      });
      continue;
    }
    validEntries.push(entry);
  }

  if (failedList.length > 0) {
    onProgress?.(0, failedList);
  }

  if (validEntries.length === 0) return;

  // 2. 批量同步这些条目中的标签
  const allTags = new Set<string>();
  validEntries.forEach((e) => {
    (e.tags || []).forEach((t) => {
      const name = typeof t === "string" ? t : t.name;
      if (name) allTags.add(name);
    });
  });

  if (allTags.size > 0) {
    await syncGlobalTags({
      tags: Array.from(allTags),
      comboId,
      profile,
      requestSettings,
      shouldStop,
    });
  }

  // 3. 分批处理条目内容向量化
  const batches: Caiu[][] = [];
  for (let i = 0; i < validEntries.length; i += batchSize) {
    batches.push(validEntries.slice(i, i + batchSize));
  }

  const queue = [...batches];
  const workers = Array(Math.min(maxConcurrent, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        if (shouldStop?.()) break;
        const batch = queue.shift();
        if (!batch) break;

        try {
          const response = await executeWithRetry(
            () =>
              callEmbeddingApi(profile, {
                modelId,
                input: batch.map((e) => e.content),
              }),
            { requestSettings, label: "批量内容向量化" }
          );

          if (response.data) {
            const totalTokens = response.usage?.promptTokens ?? 0;
            const perEntryTokens =
              totalTokens > 0 ? Math.floor(totalTokens / response.data.length) : 0;
            const remainder =
              totalTokens > 0 ? totalTokens - perEntryTokens * response.data.length : 0;

            const syncTasks = response.data.map(async (item, index) => {
              const entry = batch[index];
              // 分配 token，最后一个条目加上余数
              let tokens = perEntryTokens;
              if (index === response.data.length - 1) {
                tokens += remainder;
              }
              await invoke("kb_update_entry_vector", {
                kbId,
                caiuId: entry.id,
                vector: item.embedding,
                model: modelId,
                tokens: tokens > 0 ? tokens : undefined,
              });
            });
            await Promise.all(syncTasks);
            onProgress?.(batch.length);
          }
        } catch (error: any) {
          // 批量失败尝试降级为单条
          const errorMsg = error?.message || "";
          if (batch.length > 1 && (errorMsg.includes("400") || errorMsg.includes("input"))) {
            for (const entry of batch) {
              if (shouldStop?.()) break;
              try {
                const res = await executeWithRetry(
                  () => callEmbeddingApi(profile, { modelId, input: entry.content }),
                  { requestSettings, label: `单条降级向量化-${entry.id}` }
                );
                if (res.data?.[0]) {
                  await invoke("kb_update_entry_vector", {
                    kbId,
                    caiuId: entry.id,
                    vector: res.data[0].embedding,
                    model: modelId,
                  });
                  onProgress?.(1);
                }
              } catch (singleError: any) {
                onProgress?.(0, [{ id: entry.id, reason: singleError.message || "未知错误" }]);
              }
            }
          } else {
            onProgress?.(
              0,
              batch.map((e) => ({ id: e.id, reason: errorMsg }))
            );
          }
        }
      }
    });

  await Promise.all(workers);
}

/**
 * 探测模型维度逻辑
 */
export async function performDimensionDetection(params: { profile: LlmProfile; modelId: string }) {
  const { profile, modelId } = params;
  const response = await callEmbeddingApi(profile, {
    modelId,
    input: "dimension_test",
  });

  if (response.data?.[0]?.embedding) {
    return response.data[0].embedding.length;
  }
  throw new Error("模型返回数据异常，无法获取维度");
}

/**
 * 向量检索逻辑
 */
export async function performVectorSearch(params: {
  kbId: string;
  query: string;
  comboId: string;
  profile: LlmProfile;
  topK?: number;
  requestSettings?: KnowledgeRequestSettings;
  extraFilters?: Partial<SearchFilters>;
  vector_payload?: number[];
}) {
  const {
    kbId,
    query,
    comboId,
    profile,
    topK = 5,
    requestSettings,
    extraFilters,
    vector_payload,
  } = params;
  const modelId = getPureModelId(comboId);

  logger.info("执行向量搜索", { kbId, query, topK });

  // 1. 获取查询向量 (优先使用外部传入的向量，否则带重试逻辑获取)
  let vector: number[] | null = vector_payload || null;

  if (!vector) {
    let lastError: any = null;
    const maxRetries = requestSettings?.maxRetries ?? 1; // 搜索重试次数可以少一点
    const retryInterval = requestSettings?.retryInterval ?? 2000;
    const timeout = requestSettings?.timeout ?? 30000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }

        const response = await Promise.race([
          callEmbeddingApi(profile, {
            modelId,
            input: query,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("请求超时")), timeout)
          ),
        ]);

        vector = response.data?.[0]?.embedding;
        if (vector) break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!vector) throw lastError || new Error("获取查询向量失败");
  }

  logger.info("向量准备就绪，开始后端检索", {
    dimension: vector.length,
    engineId: extraFilters?.engineId || "vector",
  });

  // 2. 后端检索
  const startTime = Date.now();
  const results = await invoke<any[]>("kb_search", {
    query,
    filters: {
      kbIds: [kbId],
      limit: topK,
      ...extraFilters,
    },
    engineId: extraFilters?.engineId || "vector",
    vectorPayload: vector,
    model: modelId,
  });
  const duration = Date.now() - startTime;

  logger.info("后端检索完成", {
    count: results.length,
    duration: `${duration}ms`,
    topScore: results[0]?.score,
  });

  return results;
}
