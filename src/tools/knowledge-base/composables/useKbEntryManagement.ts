import { invoke } from "@tauri-apps/api/core";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { kbStorage } from "../utils/kbStorage";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { Caiu, CaiuInput } from "../types";
import { useKbVectorSync } from "./useKbVectorSync";

const errorHandler = createModuleErrorHandler("useKbEntryManagement");

export function useKbEntryManagement() {
  const store = useKnowledgeBaseStore();
  const { updateVectors } = useKbVectorSync();

  /**
   * 添加新条目
   */
  async function addEntry(
    key: string,
    content: string = "",
    options: { select?: boolean; sync?: boolean; autoVectorize?: boolean } = {}
  ) {
    const { select = true, sync = true, autoVectorize = true } = options;
    if (!store.activeBaseId || !store.activeBaseMeta) return null;
    try {
      const entryId = crypto.randomUUID();
      const now = Date.now();

      const newEntry: Caiu = {
        id: entryId,
        key,
        content,
        contentHash: "",
        tags: [],
        assets: [],
        priority: 100,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };

      const savedEntry = await invoke<Caiu>("kb_upsert_entry", {
        kbId: store.activeBaseId,
        entry: newEntry,
        config: {
          autoExtractTags: store.config.importSettings?.autoExtractTags ?? true,
          autoExtractTitle: store.config.importSettings?.autoExtractTitle ?? false,
        },
      });

      store.entriesCache.set(entryId, savedEntry);
      if (!store.loadedEntryIds.includes(entryId)) {
        store.loadedEntryIds.push(entryId);
      }

      if (select) {
        store.activeEntryId = entryId;
      }

      store.activeBaseMeta.entries.push({
        id: entryId,
        key: savedEntry.key,
        summary: savedEntry.summary || content.substring(0, 100),
        tags: (savedEntry.tags || []).map((t: any) => (typeof t === "string" ? t : t.name)),
        priority: 100,
        updatedAt: now,
        vectorStatus: "none",
        vectorizedModels: [],
        contentHash: savedEntry.contentHash,
      });

      if (sync) {
        await store.syncBaseMeta();
      }

      if (autoVectorize && store.config.importSettings?.autoVectorize) {
        updateVectors(undefined, [entryId]).catch((err) => {
          errorHandler.handle(err, {
            userMessage: `自动向量化失败 [${entryId}]`,
            showToUser: false,
          });
        });
      }

      return entryId;
    } catch (e) {
      errorHandler.error(e, "创建条目失败");
      return null;
    }
  }

  /**
   * 批量导入本地文件路径
   */
  async function batchImportFiles(paths: string[]) {
    if (!store.activeBaseId || !store.activeBaseMeta || paths.length === 0) {
      return { ids: [], skippedCount: 0, dupeCount: 0 };
    }

    store.loading = true;
    try {
      const result = await invoke<{
        entries: Caiu[];
        skippedCount: number;
        duplicateCount: number;
      }>("kb_batch_import_files", {
        kbId: store.activeBaseId,
        paths,
        deduplicate: store.config.importSettings?.deduplicate ?? true,
        config: {
          autoExtractTags: store.config.importSettings?.autoExtractTags ?? true,
          autoExtractTitle: store.config.importSettings?.autoExtractTitle ?? false,
        },
      });

      if (result.entries.length > 0) {
        for (const entry of result.entries) {
          store.activeBaseMeta.entries.push({
            id: entry.id,
            key: entry.key,
            summary: entry.summary || "",
            tags: (entry.tags || []).map((t: any) => (typeof t === "string" ? t : t.name)),
            priority: entry.priority,
            updatedAt: entry.updatedAt,
            vectorStatus: "none",
            vectorizedModels: [],
            contentHash: entry.contentHash,
          });
          store.entriesCache.set(entry.id, entry);
        }
        await store.syncBaseMeta();

        if (store.config.importSettings?.autoVectorize) {
          const ids = result.entries.map((e: any) => e.id);
          updateVectors(undefined, ids).catch(() => {});
        }
      }

      return {
        ids: result.entries.map((e: any) => e.id),
        skippedCount: result.skippedCount,
        dupeCount: result.duplicateCount,
      };
    } catch (e) {
      errorHandler.error(e, "批量导入文件失败");
      return { ids: [], skippedCount: paths.length, dupeCount: 0 };
    } finally {
      store.loading = false;
    }
  }

  /**
   * 批量添加条目内容
   */
  async function addEntries(
    items: { key: string; content: string }[],
    options: { deduplicate?: boolean } = {}
  ) {
    const { deduplicate = options.deduplicate ?? store.config.importSettings.deduplicate ?? true } =
      options;
    if (!store.activeBaseId || !store.activeBaseMeta || items.length === 0) {
      return { ids: [], skippedCount: 0, dupeCount: 0 };
    }

    store.loading = true;
    try {
      const toAdd = items.map((item) => {
        const now = Date.now();
        return {
          id: crypto.randomUUID(),
          key: item.key,
          content: item.content,
          contentHash: "",
          tags: [],
          assets: [],
          priority: 100,
          enabled: true,
          createdAt: now,
          updatedAt: now,
          summary: "",
        };
      });

      const result = await invoke<{
        entries: Caiu[];
        skippedCount: number;
        duplicateCount: number;
      }>("kb_batch_upsert_entries", {
        kbId: store.activeBaseId,
        entries: toAdd,
        deduplicate,
        config: {
          autoExtractTags: store.config.importSettings?.autoExtractTags ?? true,
          autoExtractTitle: store.config.importSettings?.autoExtractTitle ?? false,
        },
      });

      if (result.entries.length > 0) {
        for (const entry of result.entries) {
          store.activeBaseMeta.entries.push({
            id: entry.id,
            key: entry.key,
            summary: entry.summary || entry.content.substring(0, 100),
            tags: (entry.tags || []).map((t: any) => (typeof t === "string" ? t : t.name)),
            priority: entry.priority,
            updatedAt: entry.updatedAt,
            vectorStatus: "none",
            vectorizedModels: [],
            contentHash: entry.contentHash,
          });
          store.entriesCache.set(entry.id, entry);
        }
        await store.syncBaseMeta();

        if (store.config.importSettings?.autoVectorize) {
          const ids = result.entries.map((e) => e.id);
          updateVectors(undefined, ids).catch(() => {});
        }
      }

      return {
        ids: result.entries.map((e) => e.id),
        skippedCount: result.skippedCount,
        dupeCount: result.duplicateCount,
      };
    } catch (e) {
      errorHandler.error(e, "批量添加条目失败");
      return { ids: [], skippedCount: items.length, dupeCount: 0 };
    } finally {
      store.loading = false;
    }
  }


  /**
   * 更新条目
   */
  async function updateEntry(caiuId: string, input: CaiuInput, silent = false) {
    if (!store.activeBaseId || !store.activeBaseMeta) return;
    if (!silent) store.loading = true;
    try {
      const existing = await store.getOrLoadEntry(caiuId);
      if (!existing) throw new Error("条目不存在");

      const now = Date.now();
      const updated: Caiu = { ...existing, ...input, updatedAt: now };

      const savedEntry = await invoke<Caiu>("kb_upsert_entry", {
        kbId: store.activeBaseId,
        entry: updated,
        config: null,
      });

      store.entriesCache.set(caiuId, savedEntry);

      const idx = store.activeBaseMeta.entries.findIndex((e) => e.id === caiuId);
      if (idx !== -1) {
        const tagNames = (savedEntry.tags || [])
          .map((t) => (typeof t === "string" ? t : t.name))
          .filter(Boolean);

        store.activeBaseMeta.entries[idx] = {
          ...store.activeBaseMeta.entries[idx],
          key: savedEntry.key,
          summary: savedEntry.summary || savedEntry.content.substring(0, 100),
          tags: tagNames,
          priority: savedEntry.priority,
          updatedAt: now,
          contentHash: savedEntry.contentHash,
        };
      }

      await store.syncBaseMeta();
    } finally {
      if (!silent) store.loading = false;
    }
  }

  /**
   * 删除条目
   */
  async function deleteEntry(caiuId: string) {
    if (!store.activeBaseId || !store.activeBaseMeta) return;
    store.loading = true;
    try {
      await kbStorage.deleteEntry(store.activeBaseId, caiuId);
      store.activeBaseMeta.entries = store.activeBaseMeta.entries.filter((e) => e.id !== caiuId);
      store.entriesCache.delete(caiuId);
      if (store.activeEntryId === caiuId) store.activeEntryId = null;
      await store.syncBaseMeta();
      customMessage.success("条目已删除");
    } finally {
      store.loading = false;
    }
  }

  /**
   * 批量删除条目
   */
  async function deleteEntries(caiuIds: string[]) {
    if (!store.activeBaseId || !store.activeBaseMeta || caiuIds.length === 0) return;
    store.loading = true;
    try {
      await kbStorage.deleteEntries(store.activeBaseId, caiuIds);
      for (const id of caiuIds) {
        store.entriesCache.delete(id);
        if (store.activeEntryId === id) store.activeEntryId = null;
      }
      store.activeBaseMeta.entries = store.activeBaseMeta.entries.filter(
        (e) => !caiuIds.includes(e.id)
      );
      await store.syncBaseMeta();
      customMessage.success(`已删除 ${caiuIds.length} 个条目`);
    } finally {
      store.loading = false;
    }
  }

  return {
    addEntry,
    batchImportFiles,
    addEntries,
    updateEntry,
    deleteEntry,
    deleteEntries,
  };
}