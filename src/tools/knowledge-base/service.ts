import { invoke } from "@tauri-apps/api/core";
import { callEmbeddingApi } from "@/llm-apis/embedding";
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
  modelId: string,
  records: KnowledgeVectorRecord[]
): Promise<void> {
  await ensureKnowledgeInitialized();
  await invoke("knowledge_save_chunk_vectors", {
    libraryId,
    modelId,
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

export async function searchKnowledge(
  request: KnowledgeSearchRequest
): Promise<KnowledgeResult[]> {
  await ensureKnowledgeInitialized();
  const enriched = { ...request };
  if (
    !enriched.queryVector &&
    enriched.strategy !== "keyword" &&
    enriched.libraryIds.length === 1
  ) {
    const library = (await listKnowledgeLibraries()).find(
      (item) => item.id === enriched.libraryIds[0]
    );
    if (library?.embeddingModelId) {
      const { enabledProfiles, loadProfiles } = useLlmProfiles();
      await loadProfiles();
      const [profileId, parsedModelId] = parseModelCombo(
        library.embeddingModelId
      );
      const exactProfile = enabledProfiles.value.find(
        (item) =>
          item.id === profileId &&
          item.models.some((model) => model.id === parsedModelId)
      );
      const legacyProfile = enabledProfiles.value.find((item) =>
        item.models.some((model) => model.id === library.embeddingModelId)
      );
      const profile = exactProfile || legacyProfile;
      const requestModelId = exactProfile
        ? parsedModelId
        : library.embeddingModelId;
      if (profile) {
        try {
          const response = await callEmbeddingApi(profile, {
            modelId: requestModelId,
            input: enriched.query,
          });
          enriched.queryVector = response.data[0]?.embedding;
          enriched.modelId = library.embeddingModelId;
        } catch (error) {
          if (enriched.strategy !== "auto") throw error;
          logger.warn("Knowledge auto 检索生成查询向量失败，降级为关键词检索", {
            libraryId: library.id,
            modelKey: library.embeddingModelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (enriched.strategy !== "auto") {
        throw new Error(
          `资料库当前使用的 Embedding 模型不可用: ${library.embeddingModelId}`
        );
      }
    }
  }
  return invoke<KnowledgeResult[]>("knowledge_search", { request: enriched });
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
  const modelKey = buildModelCombo(profile.id, modelId);
  options.onProgress?.(0, chunks.length);
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const response = await callEmbeddingApi(profile, {
      modelId,
      input: batch.map((chunk) => chunk.content),
    });
    const records = batch.flatMap((chunk, index) => {
      const vector = response.data[index]?.embedding;
      return vector?.length ? [{ chunkId: chunk.id, vector }] : [];
    });
    if (records.length !== batch.length)
      throw new Error("Embedding 返回数量与 Knowledge chunk 数量不一致");
    await saveKnowledgeChunkVectors(libraryId, modelKey, records);
    options.onProgress?.(
      Math.min(offset + batch.length, chunks.length),
      chunks.length
    );
  }
  return chunks.length;
}
