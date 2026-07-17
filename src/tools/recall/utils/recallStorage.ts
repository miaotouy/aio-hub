// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";
import { defaultsDeep } from "lodash-es";
import type {
  WorkspaceConfig,
  RecallCollectionIndex,
  RecallCollectionMeta,
  RecallEntry,
  RecallCollection,
} from "../types";
import { DEFAULT_WORKSPACE_CONFIG } from "../config";

const errorHandler = createModuleErrorHandler("KnowledgeStorage");

export interface WorkspaceData {
  version: string;
  config: WorkspaceConfig;
  /** 仅为运行时兼容保留；集合列表始终由 Recall repository 返回。 */
  bases: RecallCollectionIndex[];
  lastActiveBaseId?: string;
}

/**
 * 思绪集分散式存储管理器 (瘦客户端)
 * 核心 IO 和检索已迁移至 Rust 后端 (KB-IMDB)
 */
export class KnowledgeStorage {
  private readonly KNOWLEDGE_DIR = "knowledge";
  private readonly WORKSPACE_FILE = "workspace.json";

  // 使用 ConfigManager 管理 Workspace (本地索引)
  private workspaceManager = createConfigManager<WorkspaceData>({
    moduleName: this.KNOWLEDGE_DIR,
    fileName: this.WORKSPACE_FILE,
    createDefault: () => ({
      version: "2.0.0",
      config: DEFAULT_WORKSPACE_CONFIG,
      bases: [],
      lastActiveBaseId: undefined,
    }),
    mergeConfig: (defaultConfig, loadedConfig) => {
      return defaultsDeep({}, loadedConfig, defaultConfig);
    },
  });

  // ================= Workspace 管理 =================

  /**
   * 加载 UI 配置。历史集合索引会被丢弃，避免 workspace 成为数据真源。
   */
  async loadWorkspace(): Promise<WorkspaceData> {
    const workspace = await this.workspaceManager.load();
    const metas = await invoke<RecallCollectionMeta[]>("recall_list_bases");
    return {
      ...workspace,
      bases: metas.map((meta) => ({
        id: meta.id,
        name: meta.name,
        description: meta.description,
        entryCount: meta.entries.length,
        updatedAt: meta.updatedAt,
        totalTokens: meta.vectorization.totalTokens,
        isIndexed: meta.vectorization.isIndexed,
        path: "",
        tags: meta.tags?.map((tag) => tag.name),
        icon: meta.icon,
      })),
    };
  }

  /**
   * 保存工作区索引
   */
  async saveWorkspace(data: WorkspaceData): Promise<void> {
    await this.workspaceManager.save({ ...data, bases: [] });
  }

  /**
   * 防抖保存工作区索引
   */
  saveWorkspaceDebounced(data: WorkspaceData): void {
    this.workspaceManager.saveDebounced({ ...data, bases: [] });
  }

  // ================= Base 管理 =================

  /**
   * 加载思绪集元数据
   */
  async loadBaseMeta(
    baseId: string,
    modelId?: string
  ): Promise<RecallCollectionMeta | null> {
    return await errorHandler.wrapAsync(
      async () => {
        return await invoke<RecallCollectionMeta | null>("recall_load_base_meta", {
          recallId: baseId,
          modelId: modelId || null,
        });
      },
      { userMessage: "加载库元数据失败", showToUser: false }
    );
  }

  /**
   * 保存思绪集元数据
   */
  async saveBaseMeta(baseId: string, meta: RecallCollectionMeta): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        await invoke("recall_save_base_meta", { recallId: baseId, meta });
      },
      { userMessage: "保存库元数据失败" }
    );
  }

  /**
   * 创建新思绪集
   */
  async createBase(
    name: string,
    description: string | null = null
  ): Promise<string> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const baseId = crypto.randomUUID();
          const now = Date.now();

          const meta: RecallCollectionMeta = {
            id: baseId,
            name,
            description,
            createdAt: now,
            updatedAt: now,
            vectorization: {
              isIndexed: false,
              lastIndexedAt: null,
              modelId: "",
              provider: "",
              dimension: 0,
            },
            entries: [],
            tags: [],
            icon: null,
            config: {
              searchTopK: 5,
              minScore: 0.5,
            },
          };

          // 集合与条目由 SQLite repository 持久化。
          await this.saveBaseMeta(baseId, meta);

          return baseId;
        },
        { userMessage: "创建思绪集失败" }
      )) || ""
    );
  }

  /**
   * 克隆思绪集
   */
  async cloneBase(baseId: string, newName: string): Promise<string> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          // 调用后端 clone，由 repository 复制源条目。
          const newBaseId = await invoke<string>("recall_clone_base", {
            recallId: baseId,
            newName,
          });

          return newBaseId;
        },
        { userMessage: "克隆思绪集失败" }
      )) || ""
    );
  }

  /**
   * 导出思绪集
   */
  async exportBase(baseId: string): Promise<RecallCollection | null> {
    return await errorHandler.wrapAsync(
      async () => {
        return await invoke<RecallCollection>("recall_export_base", { recallId: baseId });
      },
      { userMessage: "导出思绪集失败" }
    );
  }

  /**
   * 删除思绪集
   */
  async deleteBase(baseId: string): Promise<boolean> {
    const deleted = await errorHandler.wrapAsync(
      async () => {
        // 后端会删除 repository 中的集合和派生向量。
        await invoke("recall_delete_base", { recallId: baseId });

        return true;
      },
      { userMessage: "删除思绪集失败" }
    );

    return deleted === true;
  }

  // ================= Entry 管理 =================

  /**
   * 加载单个条目
   */
  async loadEntry(
    baseId: string,
    entryId: string,
    modelId?: string
  ): Promise<RecallEntry | null> {
    return await errorHandler.wrapAsync(
      async () => {
        return await invoke<RecallEntry | null>("recall_load_entry", {
          recallId: baseId,
          entryId,
          modelId: modelId || null,
        });
      },
      { userMessage: "加载条目失败", showToUser: false }
    );
  }

  /**
   * 保存单个条目
   */
  async saveEntry(baseId: string, entry: RecallEntry): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        await invoke("recall_upsert_entry", { recallId: baseId, entry });
      },
      { userMessage: "保存条目失败" }
    );
  }

  /**
   * 删除单个条目
   */
  async deleteEntry(baseId: string, entryId: string): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        await invoke("recall_delete_entry", { recallId: baseId, entryId });
      },
      { userMessage: "删除条目失败" }
    );
  }

  /**
   * 批量删除条目
   */
  async deleteEntries(baseId: string, entryIds: string[]): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        await invoke("recall_batch_delete_entries", { recallId: baseId, entryIds });
      },
      { userMessage: `批量删除 ${entryIds.length} 个条目失败` }
    );
  }

  /**
   * 列出所有条目 ID
   */
  async listEntryIds(baseId: string): Promise<string[]> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          return await invoke<string[]>("recall_list_entry_ids", { recallId: baseId });
        },
        { userMessage: "列出条目失败", showToUser: false }
      )) || []
    );
  }
}

// 导出单例
export const recallStorage = new KnowledgeStorage();
