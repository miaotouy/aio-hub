import { invoke } from "@tauri-apps/api/core";
import { callEmbeddingApi } from "@/llm-apis/embedding";
import {
  buildEmbeddingSpaceDescriptor,
  getEmbeddingSpaceId,
  getLegacyRouteCanonicalId,
  getModelIdentity,
  type EmbeddingSpaceDescriptorV1,
} from "@aiohub/llm-core";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { LlmProfile } from "@/types/llm-profiles";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { createModuleLogger } from "@/utils/logger";
import type {
  KnowledgeChunk,
  KnowledgeEnqueueResult,
  KnowledgeDocument,
  KnowledgeIngestTask,
  KnowledgeIngestRequest,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeLibraryIndexConfig,
  KnowledgeLibraryUpdate,
  KnowledgeResult,
  KnowledgeSearchExecution,
  KnowledgeSearchRequest,
  KnowledgeSource,
  KnowledgeVectorRecord,
} from "./types";
import {
  createDefaultKnowledgeLibraryConfig,
  normalizeKnowledgeLibraryConfig,
  validateKnowledgeLibraryConfig,
} from "./config";
import { knowledgeRuntimeConfigManager } from "./config";
import { KNOWLEDGE_PARSER_VERSION } from "./fileParser";

let initialization: Promise<void> | null = null;
const logger = createModuleLogger("knowledge-base/service");

export function ensureKnowledgeInitialized(): Promise<void> {
  if (!initialization) {
    initialization = invoke<void>("knowledge_initialize").catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

export async function listKnowledgeLibraries(): Promise<KnowledgeLibrary[]> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeLibrary[]>("knowledge_list_libraries");
}

export async function createKnowledgeLibrary(
  name: string,
  description?: string,
  config?: KnowledgeLibraryIndexConfig
): Promise<KnowledgeLibrary> {
  let snapshot = config;
  if (!snapshot) {
    const runtimeConfig = await knowledgeRuntimeConfigManager.load();
    snapshot = createDefaultKnowledgeLibraryConfig();
    const routeKey = runtimeConfig.defaultEmbeddingRouteKey.trim();
    if (routeKey) {
      snapshot.embedding.enabled = true;
      snapshot.embedding.routeKey = routeKey;
      snapshot.indexes.semantic = true;
    }
  }
  const normalized = normalizeKnowledgeLibraryConfig(snapshot);
  validateKnowledgeLibraryConfig(normalized);
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeLibrary>("knowledge_create_library", {
    name,
    description,
    config: normalized,
  });
}

export async function updateKnowledgeLibrary(
  libraryId: string,
  update: KnowledgeLibraryUpdate
): Promise<KnowledgeLibrary> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeLibrary>("knowledge_update_library", {
    libraryId,
    name: update.name,
    description: update.description,
  });
}

export async function applyKnowledgeLibraryConfig(
  libraryId: string,
  config: KnowledgeLibraryIndexConfig
): Promise<number> {
  const normalized = normalizeKnowledgeLibraryConfig(config);
  validateKnowledgeLibraryConfig(normalized);
  await ensureKnowledgeInitialized();
  return invoke<number>("knowledge_apply_library_config", {
    libraryId,
    config: normalized,
  });
}

export async function deleteKnowledgeLibrary(libraryId: string): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_delete_library", { libraryId });
}

export async function listKnowledgeDocuments(
  libraryId: string
): Promise<KnowledgeDocument[]> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeDocument[]>("knowledge_list_documents", { libraryId });
}

export async function listKnowledgeChunks(
  libraryId: string,
  documentId?: string
): Promise<KnowledgeChunk[]> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeChunk[]>("knowledge_list_chunks", {
    libraryId,
    documentId,
  });
}

export async function ingestKnowledgeDocument(
  request: KnowledgeIngestRequest
): Promise<KnowledgeDocument> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeDocument>("knowledge_ingest_document", { request });
}

export async function updateKnowledgeDocumentTags(
  libraryId: string,
  documentId: string,
  tags: string[]
): Promise<KnowledgeDocument> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeDocument>("knowledge_update_document_tags", {
    libraryId,
    documentId,
    tags,
  });
}

export async function enqueueKnowledgePaths(
  libraryId: string,
  paths: string[],
  sourceId?: string
): Promise<KnowledgeEnqueueResult> {
  const config = await knowledgeRuntimeConfigManager.load();
  if (paths.length > config.maxImportBatchFiles) {
    throw new Error(
      `单次最多导入 ${config.maxImportBatchFiles} 个文件，当前选择了 ${paths.length} 个`
    );
  }
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeEnqueueResult>("knowledge_enqueue_paths", {
    request: {
      libraryId,
      paths,
      sourceId,
      parserVersion: KNOWLEDGE_PARSER_VERSION,
      maxFileBytes: config.maxImportFileBytes,
      maxAttempts: config.ingestMaxAttempts,
    },
  });
}

export async function listUnvectorizedKnowledgeChunks(
  libraryId: string,
  spaceId: string
): Promise<KnowledgeChunk[]> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeChunk[]>("knowledge_list_unvectorized_chunks", {
    libraryId,
    spaceId,
  });
}

export async function listKnowledgeSources(
  libraryId: string
): Promise<KnowledgeSource[]> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeSource[]>("knowledge_list_sources", { libraryId });
}

export async function listKnowledgeIngestTasks(
  libraryId: string,
  limit = 200
): Promise<KnowledgeIngestTask[]> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeIngestTask[]>("knowledge_list_ingest_tasks", {
    libraryId,
    limit,
  });
}

export async function claimKnowledgeIngestTask(
  libraryId: string,
  leaseSeconds: number
): Promise<KnowledgeIngestTask | null> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeIngestTask | null>("knowledge_claim_ingest_task", {
    libraryId,
    leaseSeconds,
  });
}

export async function completeKnowledgeIngestTask(
  task: KnowledgeIngestTask,
  parsed: {
    title?: string;
    mimeType?: string;
    content: string;
    sourceChecksum: string;
    parserVersion: string;
  }
): Promise<KnowledgeDocument | null> {
  if (!task.leaseToken) throw new Error("Knowledge ingest task 缺少 lease token");
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeDocument | null>("knowledge_complete_ingest_task", {
    request: {
      libraryId: task.libraryId,
      taskId: task.id,
      leaseToken: task.leaseToken,
      ...parsed,
    },
  });
}

export async function failKnowledgeIngestTask(
  task: KnowledgeIngestTask,
  error: unknown,
  retryable: boolean
): Promise<KnowledgeIngestTask> {
  if (!task.leaseToken) throw new Error("Knowledge ingest task 缺少 lease token");
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeIngestTask>("knowledge_fail_ingest_task", {
    request: {
      libraryId: task.libraryId,
      taskId: task.id,
      leaseToken: task.leaseToken,
      error: error instanceof Error ? error.message : String(error),
      retryable,
      retryDelaySeconds: retryable ? task.attemptCount : 0,
    },
  });
}

export async function cancelKnowledgeIngestTask(
  libraryId: string,
  taskId: string
): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_cancel_ingest_task", { libraryId, taskId });
}

export async function retryKnowledgeIngestTask(
  libraryId: string,
  taskId: string
): Promise<KnowledgeIngestTask> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeIngestTask>("knowledge_retry_ingest_task", {
    libraryId,
    taskId,
  });
}

export async function addKnowledgeDirectorySource(options: {
  libraryId: string;
  rootPath: string;
  recursive: boolean;
  ignorePatterns: string[];
}): Promise<KnowledgeEnqueueResult> {
  const config = await knowledgeRuntimeConfigManager.load();
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeEnqueueResult>("knowledge_add_directory_source", {
    request: {
      ...options,
      parserVersion: KNOWLEDGE_PARSER_VERSION,
      maxFileBytes: config.maxImportFileBytes,
      maxAttempts: config.ingestMaxAttempts,
    },
  });
}

export async function rescanKnowledgeDirectorySource(
  libraryId: string,
  sourceId: string
): Promise<KnowledgeEnqueueResult> {
  const config = await knowledgeRuntimeConfigManager.load();
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeEnqueueResult>("knowledge_rescan_directory_source", {
    libraryId,
    sourceId,
    maxFileBytes: config.maxImportFileBytes,
    maxAttempts: config.ingestMaxAttempts,
    parserVersion: KNOWLEDGE_PARSER_VERSION,
  });
}

export async function removeKnowledgeSource(
  libraryId: string,
  sourceId: string
): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_remove_source", { libraryId, sourceId });
}

export async function deleteKnowledgeDocument(
  libraryId: string,
  documentId: string
): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_delete_document", { libraryId, documentId });
}

export async function rebuildKnowledgeLibrary(
  libraryId: string
): Promise<number> {
  await ensureKnowledgeInitialized();
  return invoke<number>("knowledge_rebuild_library", { libraryId });
}

export async function saveKnowledgeChunkVectors(
  libraryId: string,
  spaceId: string,
  descriptor: EmbeddingSpaceDescriptorV1,
  routeKey: string,
  records: KnowledgeVectorRecord[]
): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_save_chunk_vectors", {
    libraryId,
    spaceId,
    descriptorJson: JSON.stringify(descriptor),
    routeKey,
    records,
  });
}

export async function getKnowledgeIndexStatus(
  libraryId: string
): Promise<KnowledgeIndexStatus> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeIndexStatus>("knowledge_get_index_status", {
    libraryId,
  });
}

export async function switchKnowledgeEmbeddingRoute(
  libraryId: string,
  spaceId: string,
  routeKey: string
): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_switch_embedding_route", {
    libraryId,
    spaceId,
    routeKey,
  });
}

export async function searchKnowledge(
  request: KnowledgeSearchRequest
): Promise<KnowledgeResult[]> {
  return (await searchKnowledgeDetailed(request)).results;
}

export async function searchKnowledgeDetailed(
  request: KnowledgeSearchRequest
): Promise<KnowledgeSearchExecution> {
  await ensureKnowledgeInitialized();
  if (
    request.queryVector &&
    request.strategy !== "keyword" &&
    !request.spaceId?.trim()
  ) {
    throw new Error("预计算 Knowledge 查询向量必须指定 spaceId");
  }
  if (request.queryVector || request.strategy === "keyword") {
    return {
      results: await invoke<KnowledgeResult[]>("knowledge_search", { request }),
      traces: [
        {
          libraryIds: request.libraryIds,
          requestedStrategy: request.strategy,
          actualStrategy:
            request.strategy === "auto" ? "hybrid" : request.strategy,
        },
      ],
    };
  }

  const allLibraries = await listKnowledgeLibraries();
  const libraries = request.libraryIds.length
    ? request.libraryIds.map((libraryId) => {
        const library = allLibraries.find((item) => item.id === libraryId);
        if (!library) throw new Error(`找不到 Knowledge library: ${libraryId}`);
        return library;
      })
    : allLibraries;
  const groups = new Map<string, KnowledgeLibrary[]>();
  for (const library of libraries) {
    const routeKey = library.embeddingRouteKey || library.embeddingModelId;
    const key =
      library.activeEmbeddingSpaceId && routeKey
        ? `${library.activeEmbeddingSpaceId}\u0000${routeKey}`
        : `keyword\u0000${library.id}`;
    const group = groups.get(key) ?? [];
    group.push(library);
    groups.set(key, group);
  }

  const results: KnowledgeResult[] = [];
  const traces: KnowledgeSearchExecution["traces"] = [];
  for (const group of groups.values()) {
    const library = group[0];
    const routeKey = library.embeddingRouteKey || library.embeddingModelId;
    try {
      if (!library.activeEmbeddingSpaceId || !routeKey) {
        throw new Error(`资料库尚未建立语义索引: ${library.name}`);
      }
      const queryVector = await createKnowledgeQueryVector(
        library,
        routeKey,
        request.query
      );
      results.push(
        ...(await invoke<KnowledgeResult[]>("knowledge_search", {
          request: {
            ...request,
            libraryIds: group.map((item) => item.id),
            queryVector,
            spaceId: library.activeEmbeddingSpaceId,
          },
        }))
      );
      traces.push({
        libraryIds: group.map((item) => item.id),
        requestedStrategy: request.strategy,
        actualStrategy:
          request.strategy === "auto" ? "hybrid" : request.strategy,
      });
    } catch (error) {
      if (request.strategy !== "auto") throw error;
      logger.warn("Knowledge auto 检索生成查询向量失败，分组降级为关键词检索", {
        libraryIds: group.map((item) => item.id),
        routeKey,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push(
        ...(await invoke<KnowledgeResult[]>("knowledge_search", {
          request: {
            ...request,
            libraryIds: group.map((item) => item.id),
            strategy: "keyword",
          },
        }))
      );
      traces.push({
        libraryIds: group.map((item) => item.id),
        requestedStrategy: request.strategy,
        actualStrategy: "keyword",
        degradationReason:
          error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    results: results.sort((a, b) => b.score - a.score).slice(0, request.limit),
    traces,
  };
}

async function createKnowledgeQueryVector(
  library: KnowledgeLibrary,
  routeKey: string,
  query: string
): Promise<number[]> {
  const { enabledProfiles, loadProfiles } = useLlmProfiles();
  await loadProfiles();
  const [profileId, parsedModelId] = parseModelCombo(routeKey);
  const exactProfile = enabledProfiles.value.find(
    (item) =>
      item.id === profileId &&
      item.models.some((model) => model.id === parsedModelId)
  );
  const legacyProfile = enabledProfiles.value.find((item) =>
    item.models.some((model) => model.id === routeKey)
  );
  const profile = exactProfile || legacyProfile;
  const requestModelId = exactProfile ? parsedModelId : routeKey;
  if (!profile) {
    throw new Error(`资料库当前使用的 Embedding 模型渠道不可用: ${routeKey}`);
  }
  const descriptor = library.embeddingSpaceDescriptor;
  if (!descriptor) throw new Error("资料库缺少 Embedding space descriptor");
  const routeModel = profile.models.find(
    (model) => model.id === requestModelId
  );
  const identity = routeModel ? getModelIdentity(routeModel) : null;
  if (
    !descriptor.model.canonicalId.startsWith("legacy-route/") &&
    (identity?.canonicalId !== descriptor.model.canonicalId ||
      (identity.revision ?? "") !== (descriptor.model.revision ?? ""))
  ) {
    throw new Error("当前路由的模型身份与资料库向量空间不一致");
  }
  const response = await callEmbeddingApi(profile, {
    modelId: requestModelId,
    input: query,
    dimensions: descriptor.dimensions,
    taskType: descriptor.queryTaskType,
    encodingFormat: descriptor.encodingFormat,
  });
  const vector = response.data[0]?.embedding;
  if (!vector?.length || vector.length !== descriptor.dimensions) {
    throw new Error("查询向量维度与资料库向量空间不一致");
  }
  return vector;
}

export async function vectorizeKnowledgeLibrary(
  libraryId: string,
  options: {
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<number> {
  const library = (await listKnowledgeLibraries()).find(
    (item) => item.id === libraryId
  );
  if (!library) throw new Error(`找不到 Knowledge library: ${libraryId}`);
  const config = normalizeKnowledgeLibraryConfig(library.config);
  validateKnowledgeLibraryConfig(config);
  if (!config.embedding.enabled || !config.embedding.routeKey) {
    throw new Error("资料库未配置启用的 Embedding route");
  }
  const runtimeConfig = await knowledgeRuntimeConfigManager.load();
  const chunks = library.activeEmbeddingSpaceId
    ? await listUnvectorizedKnowledgeChunks(
        libraryId,
        library.activeEmbeddingSpaceId
      )
    : await listKnowledgeChunks(libraryId);
  const batchSize = runtimeConfig.embeddingBatchSize;
  const routeKey = config.embedding.routeKey;
  const [profileId, modelId] = parseModelCombo(routeKey);
  const { enabledProfiles, loadProfiles } = useLlmProfiles();
  await loadProfiles();
  const profile = enabledProfiles.value.find((item) => item.id === profileId);
  if (!profile) throw new Error(`找不到 Embedding 渠道: ${profileId}`);
  const embeddingProfile: LlmProfile = profile;
  const routeModel = embeddingProfile.models.find((model) => model.id === modelId);
  if (!routeModel) throw new Error(`渠道中找不到 Embedding 模型: ${modelId}`);
  const identity = getModelIdentity(routeModel);
  const canonicalId =
    identity?.canonicalId ??
    (await getLegacyRouteCanonicalId({
      profileId: embeddingProfile.id,
      modelId,
    }));
  options.onProgress?.(0, chunks.length);
  if (chunks.length === 0) return 0;

  const batches: KnowledgeChunk[][] = [];
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    batches.push(chunks.slice(offset, offset + batchSize));
  }

  async function embedBatch(
    batch: KnowledgeChunk[]
  ): Promise<KnowledgeVectorRecord[]> {
    let response: Awaited<ReturnType<typeof callEmbeddingApi>> | null = null;
    let lastError: unknown;
    for (
      let attempt = 0;
      attempt <= runtimeConfig.embeddingMaxRetries;
      attempt += 1
    ) {
      try {
        response = await callEmbeddingApi(embeddingProfile, {
          modelId,
          input: batch.map((chunk) => chunk.content),
          dimensions: config.embedding.requestedDimensions,
          taskType: config.embedding.documentTaskType,
          encodingFormat: config.embedding.encodingFormat,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt >= runtimeConfig.embeddingMaxRetries) break;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            runtimeConfig.embeddingRetryDelayMs * (attempt + 1)
          )
        );
      }
    }
    if (!response) throw lastError;
    const records = batch.flatMap((chunk, index) => {
      const vector = response.data[index]?.embedding;
      return vector?.length ? [{ chunkId: chunk.id, vector }] : [];
    });
    if (records.length !== batch.length)
      throw new Error("Embedding 返回数量与 Knowledge chunk 数量不一致");
    return records;
  }

  const firstBatch = batches[0];
  const firstRecords = await embedBatch(firstBatch);
  const descriptor: EmbeddingSpaceDescriptorV1 =
    buildEmbeddingSpaceDescriptor({
      modelIdentity: {
        canonicalId,
        ...(identity?.revision ? { revision: identity.revision } : {}),
      },
      dimensions: firstRecords[0]?.vector.length ?? 0,
      queryTaskType: config.embedding.queryTaskType,
      documentTaskType: config.embedding.documentTaskType,
      encodingFormat: config.embedding.encodingFormat,
      adapterContractVersion: config.embedding.adapterContractVersion,
    });
  const spaceId = await getEmbeddingSpaceId(descriptor);
  if (
    library.activeEmbeddingSpaceId &&
    library.activeEmbeddingSpaceId !== spaceId
  ) {
    throw new Error(
      "Embedding 实际 descriptor 与资料库活动空间不一致，请先确认配置并重建语义索引"
    );
  }
  await saveKnowledgeChunkVectors(
    libraryId,
    spaceId,
    descriptor,
    routeKey,
    firstRecords
  );
  let processed = firstBatch.length;
  options.onProgress?.(processed, chunks.length);

  let nextBatchIndex = 1;
  let workerError: unknown;
  async function worker(): Promise<void> {
    while (workerError === undefined && nextBatchIndex < batches.length) {
      const batch = batches[nextBatchIndex];
      nextBatchIndex += 1;
      try {
        const records = await embedBatch(batch);
        if (records[0]?.vector.length !== descriptor.dimensions) {
          throw new Error("Embedding 分批响应的向量维度不一致");
        }
        await saveKnowledgeChunkVectors(
          libraryId,
          spaceId,
          descriptor,
          routeKey,
          records
        );
        processed += batch.length;
        options.onProgress?.(processed, chunks.length);
      } catch (error) {
        workerError ??= error;
      }
    }
  }
  const workerCount = Math.min(
    runtimeConfig.embeddingRequestConcurrency,
    Math.max(0, batches.length - 1)
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (workerError !== undefined) throw workerError;
  return chunks.length;
}
