import { invoke } from "@tauri-apps/api/core";
import type { Caiu, KnowledgeBaseMeta, SearchFilters } from "../../types";
import type { SearchResult } from "../../types/search";

/**
 * 知识库后端适配器接口
 */
export interface BackendAdapter {
  // 核心初始化与同步
  initialize(): Promise<void>;
  warmup(): Promise<void>;

  // 条目加载与保存
  loadEntry(kbId: string, entryId: string, modelId?: string): Promise<Caiu | null>;
  loadBaseMeta(kbId: string, modelId?: string): Promise<KnowledgeBaseMeta | null>;

  // 向量同步
  updateEntryVector(params: {
    kbId: string;
    caiuId: string;
    vector: number[];
    model: string;
    tokens?: number;
  }): Promise<void>;

  loadModelVectors(kbId: string, modelId: string): Promise<void>;

  // 标签池
  getMissingTags(modelId: string, tags: string[]): Promise<string[]>;
  syncTagVectors(modelId: string, data: [string, number[]][]): Promise<void>;
  rebuildTagPoolIndex(modelId: string): Promise<void>;

  // 检索实现
  search(params: {
    query: string;
    filters: SearchFilters;
    engineId: string;
    vectorPayload?: number[];
    model?: string;
  }): Promise<SearchResult[]>;

  checkVectorCoverage(params: { kbIds: string[]; modelId: string }): Promise<any>;
}

/**
 * Tauri 后端真实实现
 */
export class TauriBackendAdapter implements BackendAdapter {
  async initialize(): Promise<void> {
    return invoke("kb_initialize");
  }

  async warmup(): Promise<void> {
    return invoke("kb_warmup");
  }

  async loadEntry(kbId: string, entryId: string, modelId?: string): Promise<Caiu | null> {
    return invoke<Caiu | null>("kb_load_entry", { kbId, entryId, modelId });
  }

  async loadBaseMeta(kbId: string, modelId?: string): Promise<KnowledgeBaseMeta | null> {
    return invoke<KnowledgeBaseMeta | null>("kb_load_base_meta", { kbId, modelId });
  }

  async updateEntryVector(params: {
    kbId: string;
    caiuId: string;
    vector: number[];
    model: string;
    tokens?: number;
  }): Promise<void> {
    return invoke("kb_update_entry_vector", params);
  }

  async loadModelVectors(kbId: string, modelId: string): Promise<void> {
    return invoke("kb_load_model_vectors", { kbId, modelId });
  }

  async getMissingTags(modelId: string, tags: string[]): Promise<string[] | any> {
    return invoke("kb_get_missing_tags", { modelId, tags });
  }

  async syncTagVectors(modelId: string, data: [string, number[]][]): Promise<void> {
    return invoke("kb_sync_tag_vectors", { modelId, data });
  }

  async rebuildTagPoolIndex(modelId: string): Promise<void> {
    return invoke("kb_rebuild_tag_pool_index", { modelId });
  }

  async search(params: {
    query: string;
    filters: SearchFilters;
    engineId: string;
    vectorPayload?: number[];
    model?: string;
  }): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("kb_search", params);
  }

  async checkVectorCoverage(params: { kbIds: string[]; modelId: string }): Promise<any> {
    return invoke("kb_check_vector_coverage", params);
  }
}
