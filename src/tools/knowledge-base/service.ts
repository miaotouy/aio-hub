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
import { buildModelCombo, parseModelCombo } from "@/utils/modelIdUtils";
import { createModuleLogger } from "@/utils/logger";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestRequest,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeResult,
  KnowledgeSearchRequest,
  KnowledgeVectorRecord,
} from "./types";

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
  description?: string
): Promise<KnowledgeLibrary> {
  await ensureKnowledgeInitialized();
  return invoke<KnowledgeLibrary>("knowledge_create_library", {
    name,
    description,
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
  await ensureKnowledgeInitialized();
  if (
    request.queryVector &&
    request.strategy !== "keyword" &&
    !request.spaceId?.trim()
  ) {
    throw new Error("预计算 Knowledge 查询向量必须指定 spaceId");
  }
  if (request.queryVector || request.strategy === "keyword") {
    return invoke<KnowledgeResult[]>("knowledge_search", { request });
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
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, request.limit);
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
  modelId: string,
  profile: LlmProfile,
  options: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<number> {
  const chunks = await listKnowledgeChunks(libraryId);
  const batchSize = Math.max(1, options.batchSize ?? 32);
  const routeKey = buildModelCombo(profile.id, modelId);
  const routeModel = profile.models.find((model) => model.id === modelId);
  if (!routeModel) throw new Error(`渠道中找不到 Embedding 模型: ${modelId}`);
  const identity = getModelIdentity(routeModel);
  const canonicalId =
    identity?.canonicalId ??
    (await getLegacyRouteCanonicalId({ profileId: profile.id, modelId }));
  let descriptor: EmbeddingSpaceDescriptorV1 | null = null;
  let spaceId = "";
  options.onProgress?.(0, chunks.length);
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const response = await callEmbeddingApi(profile, {
      modelId,
      input: batch.map((chunk) => chunk.content),
      taskType: "RETRIEVAL_DOCUMENT",
      encodingFormat: "float",
    });
    const records = batch.flatMap((chunk, index) => {
      const vector = response.data[index]?.embedding;
      return vector?.length ? [{ chunkId: chunk.id, vector }] : [];
    });
    if (records.length !== batch.length)
      throw new Error("Embedding 返回数量与 Knowledge chunk 数量不一致");
    const dimensions = records[0]?.vector.length ?? 0;
    if (!descriptor) {
      descriptor = buildEmbeddingSpaceDescriptor({
        modelIdentity: {
          canonicalId,
          ...(identity?.revision ? { revision: identity.revision } : {}),
        },
        dimensions,
        queryTaskType: "RETRIEVAL_QUERY",
        documentTaskType: "RETRIEVAL_DOCUMENT",
        encodingFormat: "float",
        adapterContractVersion: 1,
      });
      spaceId = await getEmbeddingSpaceId(descriptor);
    } else if (dimensions !== descriptor.dimensions) {
      throw new Error("Embedding 分批响应的向量维度不一致");
    }
    await saveKnowledgeChunkVectors(
      libraryId,
      spaceId,
      descriptor,
      routeKey,
      records
    );
    options.onProgress?.(
      Math.min(offset + batch.length, chunks.length),
      chunks.length
    );
  }
  return chunks.length;
}
