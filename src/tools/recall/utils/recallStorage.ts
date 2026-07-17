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
  bases: RecallCollectionIndex[];
  lastActiveBaseId?: string;
}

/**
 * 思绪集分散式存储管理器 (瘦客户端)
 * 核心 IO 和检索已迁移至 Rust 后端 (KB-IMDB)
 */
export class KnowledgeStorage {
  private readonly KNOWLEDGE_DIR = "knowledge";
  private readonly BASES_DIR = "bases";
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
   * 加载工作区索引
   */
  async loadWorkspace(): Promise<WorkspaceData> {
    return await this.workspaceManager.load();
  }

  /**
   * 保存工作区索引
   */
  async saveWorkspace(data: WorkspaceData): Promise<void> {
    await this.workspaceManager.save(data);
  }

  /**
   * 防抖保存工作区索引
   */
  saveWorkspaceDebounced(data: WorkspaceData): void {
    this.workspaceManager.saveDebounced(data);
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

          // 1. 调用后端保存元数据 (后端会自动创建目录并初始化内存索引)
          await this.saveBaseMeta(baseId, meta);

          // 2. 更新 Workspace 索引
          const workspace = await this.loadWorkspace();
          workspace.bases.push({
            id: baseId,
            name,
            description,
            entryCount: 0,
            updatedAt: now,
            isIndexed: false,
            path: `${this.BASES_DIR}/${baseId}`,
          });
          await this.saveWorkspace(workspace);

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
          // 1. 调用后端克隆 (包含物理文件、向量和内存索引)
          const newBaseId = await invoke<string>("recall_clone_base", {
            recallId: baseId,
            newName,
          });

          // 2. 加载新库的元数据以更新 Workspace 索引
          const newMeta = await this.loadBaseMeta(newBaseId);
          if (!newMeta) throw new Error("克隆成功但无法加载新库元数据");

          // 3. 更新 Workspace 索引
          const workspace = await this.loadWorkspace();
          workspace.bases.push({
            id: newBaseId,
            name: newMeta.name,
            description: newMeta.description,
            entryCount: newMeta.entries.length,
            updatedAt: newMeta.updatedAt,
            isIndexed: newMeta.vectorization.isIndexed,
            path: `${this.BASES_DIR}/${newBaseId}`,
            tags: (newMeta.tags || []).map((t) => t.name),
            icon: newMeta.icon,
          });
          await this.saveWorkspace(workspace);

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
        // 1. 后端删除物理文件、向量和内存索引
        await invoke("recall_delete_base", { recallId: baseId });

        // 2. 更新 Workspace 索引
        const workspace = await this.loadWorkspace();
        workspace.bases = workspace.bases.filter((b) => b.id !== baseId);
        await this.saveWorkspace(workspace);

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
