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

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import yaml from "js-yaml";
import { createModuleLogger } from "@/utils/logger";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { recallStorage } from "../utils/recallStorage";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { RecallCollectionMeta } from "../types";
import { getPureModelId } from "../utils/recallUtils";

const errorHandler = createModuleErrorHandler("useRecallManagement");
const logger = createModuleLogger("useRecallManagement");

export function useRecallManagement() {
  const store = useRecallCollectionStore();

  /**
   * 切换思绪集
   */
  async function switchBase(baseId: string, silent = false) {
    if (!baseId) return;
    if (!silent) store.loading = true;
    store.activeBaseId = baseId;
    store.activeEntryId = null;

    try {
      const modelId = getPureModelId(store.config.defaultEmbeddingModel);
      const meta = await recallStorage.loadBaseMeta(baseId, modelId);
      if (!meta) throw new Error("找不到思绪集元数据");
      store.activeBaseMeta = meta;

      // 索引已包含在 meta 中
      store.loadedEntryIds = meta.entries.map((e) => e.id);

      // 关键优化：立即根据 meta 同步向量状态集合，避免等待后台统计导致的 UI 延迟
      const readyIds = new Set<string>();
      meta.entries.forEach((e) => {
        if (e.vectorStatus === "ready") {
          readyIds.add(e.id);
        }
      });
      store.vectorizedIds = readyIds;

      // 切换库后立即触发一次向量状态校验 (异步执行，不阻塞 loading)
      store.validateVectorStatus().catch((e) => {
        logger.warn("校验向量状态失败", e);
      });

      // 清理旧缓存
      store.entriesCache.clear();

      // 记录最后一次选中的库
      if (store.workspace) {
        store.workspace.lastActiveBaseId = baseId;
        await store.saveWorkspace();
      }
    } catch (e) {
      errorHandler.error(e, "加载思绪集失败");
      store.activeBaseId = null;
      store.activeBaseMeta = null;
    } finally {
      if (!silent) store.loading = false;
    }
  }

  /**
   * 创建思绪集
   */
  async function createBase(name: string, description?: string) {
    // 检查重名
    const isDuplicate = store.bases.some((b) => b.name === name);
    if (isDuplicate) {
      customMessage.error(`思绪集名称 [${name}] 已存在`);
      return;
    }

    store.loading = true;
    try {
      const baseId = await recallStorage.createBase(name, description);
      if (baseId) {
        customMessage.success("思绪集创建成功");
        await store.loadBases();
        await switchBase(baseId);
      }
    } finally {
      store.loading = false;
    }
  }

  /**
   * 更新思绪集元数据
   */
  async function updateBaseMeta(
    recallId: string,
    updates: Partial<RecallCollectionMeta>
  ) {
    // 检查重名 (如果修改了名称)
    if (updates.name) {
      const isDuplicate = store.bases.some(
        (b) => b.name === updates.name && b.id !== recallId
      );
      if (isDuplicate) {
        customMessage.error(`思绪集名称 [${updates.name}] 已存在`);
        return;
      }
    }

    store.loading = true;
    try {
      const modelId = getPureModelId(store.config.defaultEmbeddingModel);
      const meta = await recallStorage.loadBaseMeta(recallId, modelId);
      if (meta) {
        const now = Date.now();
        Object.assign(meta, { ...updates, updatedAt: now });
        await recallStorage.saveBaseMeta(recallId, meta);

        if (store.workspace) {
          const idx = store.workspace.bases.findIndex((b) => b.id === recallId);
          if (idx !== -1) {
            const tagNames = (meta.tags || []).map((t) => t.name);
            store.workspace.bases[idx] = {
              ...store.workspace.bases[idx],
              name: meta.name,
              description: meta.description,
              tags: tagNames,
              icon: meta.icon,
              updatedAt: now,
            };
            await recallStorage.saveWorkspace(store.workspace);
          }
        }

        if (store.activeBaseId === recallId) store.activeBaseMeta = meta;
        await store.loadBases();
      }
    } finally {
      store.loading = false;
    }
  }

  /**
   * 克隆思绪集
   */
  async function cloneBase(recallId: string) {
    store.loading = true;
    try {
      const modelId = getPureModelId(store.config.defaultEmbeddingModel);
      const sourceMeta = await recallStorage.loadBaseMeta(recallId, modelId);
      if (!sourceMeta) throw new Error("找不到源思绪集元数据");

      let newName = `${sourceMeta.name} (副本)`;
      let counter = 1;
      // 自动处理重名
      while (store.bases.some((b) => b.name === newName)) {
        newName = `${sourceMeta.name} (副本 ${counter++})`;
      }

      const newBaseId = await recallStorage.cloneBase(recallId, newName);

      if (newBaseId) {
        customMessage.success(`思绪集 [${sourceMeta.name}] 克隆成功`);
        await store.loadBases();
        await switchBase(newBaseId);
      }
    } catch (e) {
      errorHandler.error(e, "克隆思绪集失败");
    } finally {
      store.loading = false;
    }
  }

  /**
   * 导出思绪集
   */
  async function exportBase(recallId: string) {
    store.loading = true;
    try {
      const fullData = await recallStorage.exportBase(recallId);
      if (!fullData) throw new Error("导出数据为空");

      const fileName = `${fullData.meta.name}_export_${new Date().toISOString().slice(0, 10)}.json`;

      const filePath = await save({
        filters: [
          { name: "JSON", extensions: ["json"] },
          { name: "YAML", extensions: ["yaml", "yml"] },
        ],
        defaultPath: fileName,
      });

      if (filePath) {
        const isYaml = filePath.endsWith(".yaml") || filePath.endsWith(".yml");
        const content = isYaml
          ? yaml.dump(fullData)
          : JSON.stringify(fullData, null, 2);

        await writeTextFile(filePath, content);
        customMessage.success("思绪集导出成功");
      }
    } catch (e) {
      errorHandler.error(e, "导出思绪集失败");
    } finally {
      store.loading = false;
    }
  }

  /**
   * 删除思绪集
   */
  async function deleteBase(recallId: string) {
    store.loading = true;
    try {
      const deleted = await recallStorage.deleteBase(recallId);
      if (!deleted) return;

      await store.loadBases();
      if (store.activeBaseId === recallId) {
        store.activeBaseId = null;
        store.activeBaseMeta = null;
        store.entriesCache.clear();
        store.loadedEntryIds = [];
      }
      customMessage.success("思绪集已删除");
    } finally {
      store.loading = false;
    }
  }

  return {
    switchBase,
    createBase,
    updateBaseMeta,
    cloneBase,
    exportBase,
    deleteBase,
  };
}
