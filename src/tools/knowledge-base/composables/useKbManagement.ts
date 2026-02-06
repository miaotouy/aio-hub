import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import yaml from "js-yaml";
import { createModuleLogger } from "@/utils/logger";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { kbStorage } from "../utils/kbStorage";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { KnowledgeBaseMeta } from "../types";
import { getPureModelId } from "../utils/kbUtils";

const errorHandler = createModuleErrorHandler("useKbManagement");
const logger = createModuleLogger("useKbManagement");

export function useKbManagement() {
  const store = useKnowledgeBaseStore();

  /**
   * 切换知识库
   */
  async function switchBase(baseId: string, silent = false) {
    if (!baseId) return;
    if (!silent) store.loading = true;
    store.activeBaseId = baseId;
    store.activeEntryId = null;

    try {
      const modelId = getPureModelId(store.config.defaultEmbeddingModel);
      const meta = await kbStorage.loadBaseMeta(baseId, modelId);
      if (!meta) throw new Error("找不到知识库元数据");
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
      errorHandler.error(e, "加载知识库失败");
      store.activeBaseId = null;
      store.activeBaseMeta = null;
    } finally {
      if (!silent) store.loading = false;
    }
  }

  /**
   * 创建知识库
   */
  async function createBase(name: string, description?: string) {
    // 检查重名
    const isDuplicate = store.bases.some((b) => b.name === name);
    if (isDuplicate) {
      customMessage.error(`知识库名称 [${name}] 已存在`);
      return;
    }

    store.loading = true;
    try {
      const baseId = await kbStorage.createBase(name, description);
      if (baseId) {
        customMessage.success("知识库创建成功");
        await store.loadBases();
        await switchBase(baseId);
      }
    } finally {
      store.loading = false;
    }
  }

  /**
   * 更新知识库元数据
   */
  async function updateBaseMeta(kbId: string, updates: Partial<KnowledgeBaseMeta>) {
    // 检查重名 (如果修改了名称)
    if (updates.name) {
      const isDuplicate = store.bases.some((b) => b.name === updates.name && b.id !== kbId);
      if (isDuplicate) {
        customMessage.error(`知识库名称 [${updates.name}] 已存在`);
        return;
      }
    }

    store.loading = true;
    try {
      const modelId = getPureModelId(store.config.defaultEmbeddingModel);
      const meta = await kbStorage.loadBaseMeta(kbId, modelId);
      if (meta) {
        const now = Date.now();
        Object.assign(meta, { ...updates, updatedAt: now });
        await kbStorage.saveBaseMeta(kbId, meta);

        if (store.workspace) {
          const idx = store.workspace.bases.findIndex((b) => b.id === kbId);
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
            await kbStorage.saveWorkspace(store.workspace);
          }
        }

        if (store.activeBaseId === kbId) store.activeBaseMeta = meta;
        await store.loadBases();
      }
    } finally {
      store.loading = false;
    }
  }

  /**
   * 克隆知识库
   */
  async function cloneBase(kbId: string) {
    store.loading = true;
    try {
      const modelId = getPureModelId(store.config.defaultEmbeddingModel);
      const sourceMeta = await kbStorage.loadBaseMeta(kbId, modelId);
      if (!sourceMeta) throw new Error("找不到源知识库元数据");

      let newName = `${sourceMeta.name} (副本)`;
      let counter = 1;
      // 自动处理重名
      while (store.bases.some((b) => b.name === newName)) {
        newName = `${sourceMeta.name} (副本 ${counter++})`;
      }

      const newBaseId = await kbStorage.cloneBase(kbId, newName);

      if (newBaseId) {
        customMessage.success(`知识库 [${sourceMeta.name}] 克隆成功`);
        await store.loadBases();
        await switchBase(newBaseId);
      }
    } catch (e) {
      errorHandler.error(e, "克隆知识库失败");
    } finally {
      store.loading = false;
    }
  }

  /**
   * 导出知识库
   */
  async function exportBase(kbId: string) {
    store.loading = true;
    try {
      const fullData = await kbStorage.exportBase(kbId);
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
        const content = isYaml ? yaml.dump(fullData) : JSON.stringify(fullData, null, 2);

        await writeTextFile(filePath, content);
        customMessage.success("知识库导出成功");
      }
    } catch (e) {
      errorHandler.error(e, "导出知识库失败");
    } finally {
      store.loading = false;
    }
  }

  /**
   * 删除知识库
   */
  async function deleteBase(kbId: string) {
    store.loading = true;
    try {
      await kbStorage.deleteBase(kbId);
      await store.loadBases();
      if (store.activeBaseId === kbId) {
        store.activeBaseId = null;
        store.activeBaseMeta = null;
        store.entriesCache.clear();
        store.loadedEntryIds = [];
      }
      customMessage.success("知识库已删除");
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
