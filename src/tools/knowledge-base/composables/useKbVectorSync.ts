import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useNotification } from "@/composables/useNotification";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { kbStorage } from "../utils/kbStorage";
import { getPureModelId } from "../utils/kbUtils";
import { syncGlobalTags, syncEntriesVectors } from "../core/kbIndexer";
import { performGenerateTags, mergeTags } from "../core/tagGenerator";

const errorHandler = createModuleErrorHandler("useKbVectorSync");

export function useKbVectorSync() {
  const store = useKnowledgeBaseStore();
  const notify = useNotification();

  /**
   * 批量更新向量
   */
  async function updateVectors(
    kbIds?: string[],
    entryIds?: string[],
    options: { customComboId?: string } = {}
  ) {
    if (!store.activeBaseId || !store.activeBaseMeta) return;
    const comboId = options.customComboId || store.config.defaultEmbeddingModel;
    if (!comboId) {
      customMessage.warning("请先在设置中配置默认 Embedding 模型");
      return;
    }

    const profileId = comboId.split(":")[0];
    const pureModelId = getPureModelId(comboId);
    const { profiles } = useLlmProfiles();
    const profile = profiles.value.find((p) => p.id === profileId);
    if (!profile) {
      customMessage.error("未找到对应的模型配置 Profile");
      return;
    }

    // 1. 收集任务
    const allPendingTasks: { kbId: string; entries: any[] }[] = [];
    let totalPending = 0;

    if (entryIds && store.activeBaseId && store.activeBaseMeta) {
      const targets = store.activeBaseMeta.entries.filter((e) => entryIds.includes(e.id));
      if (targets.length > 0) {
        allPendingTasks.push({ kbId: store.activeBaseId, entries: targets });
        totalPending = targets.length;
      }
    } else if (kbIds) {
      for (const id of kbIds) {
        const meta =
          id === store.activeBaseId
            ? store.activeBaseMeta
            : await kbStorage.loadBaseMeta(id, pureModelId);
        if (!meta) continue;
        const pending = meta.entries.filter((e) => {
          return e.vectorStatus !== "ready" || !e.vectorizedModels?.includes(pureModelId);
        });
        if (pending.length > 0) {
          allPendingTasks.push({ kbId: id, entries: pending });
          totalPending += pending.length;
        }
      }
    } else if (store.activeBaseId && store.activeBaseMeta) {
      const pending = store.activeBaseMeta.entries.filter((e) => {
        return e.vectorStatus !== "ready" || !e.vectorizedModels?.includes(pureModelId);
      });
      if (pending.length > 0) {
        allPendingTasks.push({ kbId: store.activeBaseId, entries: pending });
        totalPending = pending.length;
      }
    }

    if (totalPending === 0) {
      // 如果是手动触发才提示，自动触发不提示
      if (!entryIds) customMessage.info("所有条目已是最新向量化状态");
      return;
    }

    store.indexingProgress = {
      total: totalPending,
      current: 0,
      isIndexing: true,
      shouldStop: false,
      failedDetails: new Map(),
    };

    try {
      for (const task of allPendingTasks) {
        if (!store.indexingProgress.isIndexing || store.indexingProgress.shouldStop) break;

        // 1. 加载所有完整的 Entry 内容
        const fullEntries: any[] = [];
        for (const entryMeta of task.entries) {
          const fullEntry = await kbStorage.loadEntry(task.kbId, entryMeta.id, pureModelId);
          if (fullEntry) fullEntries.push(fullEntry);
        }

        if (fullEntries.length === 0) continue;

        // 2. 调用批量同步逻辑
        await syncEntriesVectors({
          kbId: task.kbId,
          entries: fullEntries,
          comboId,
          profile,
          requestSettings: store.config.embeddingRequestSettings,
          shouldStop: () => store.indexingProgress.shouldStop,
          onProgress: async (processed, failed) => {
            if (processed > 0) {
              store.indexingProgress.current += processed;
              // 重新加载元数据以同步状态 (因为后端 invoke 已经更新了磁盘)
              const meta =
                task.kbId === store.activeBaseId
                  ? store.activeBaseMeta
                  : await kbStorage.loadBaseMeta(task.kbId, pureModelId);

              if (meta && task.kbId === store.activeBaseId) {
                // 更新 UI 状态
                await store.validateVectorStatus();
              }
            }

            if (failed) {
              failed.forEach((f) => {
                store.indexingProgress.failedDetails.set(f.id, f.reason);
                store.failedIds.add(f.id);
                // 即使失败也算作已处理，推进进度
                store.indexingProgress.current++;
              });
            }
          },
        });
      }

      if (store.indexingProgress.failedDetails.size > 0) {
        notify.warning(
          "向量化任务完成 (含失败项)",
          `共处理 ${store.indexingProgress.total} 项，其中 ${store.indexingProgress.failedDetails.size} 项失败。请检查条目内容是否超长或 API 配置。`,
          { source: "knowledge-base" }
        );
      } else {
        notify.success(
          "向量化任务全部完成",
          `成功补齐了 ${store.indexingProgress.total} 项索引。`,
          {
            source: "knowledge-base",
          }
        );
      }
    } finally {
      store.indexingProgress.isIndexing = false;
      await store.loadBases();
    }
  }

  /**
   * 一键同步所有知识库
   */
  async function syncAllBases() {
    if (store.indexingProgress.isIndexing) return;
    const kbIds = store.bases.map((b) => b.id);
    await updateVectors(kbIds);
    customMessage.success("全库向量化任务已提交");
  }

  /**
   * 批量向量化标签
   */
  async function batchVectorizeTags(kbIds: string[]) {
    if (kbIds.length === 0) return;
    const comboId = store.config.defaultEmbeddingModel;
    if (!comboId) {
      customMessage.warning("请先在设置中配置默认 Embedding 模型");
      return;
    }

    const [profileId] = comboId.split(":");
    const { profiles } = useLlmProfiles();
    const profile = profiles.value.find((p) => p.id === profileId);
    if (!profile) {
      customMessage.error("未找到对应的模型配置 Profile");
      return;
    }

    const allTags = new Set<string>();
    const pureModelId = getPureModelId(comboId);
    for (const id of kbIds) {
      const meta =
        id === store.activeBaseId
          ? store.activeBaseMeta
          : await kbStorage.loadBaseMeta(id, pureModelId);
      if (!meta) continue;
      meta.entries.forEach((entry) => {
        if (entry.tags) {
          entry.tags.forEach((t) => allTags.add(t));
        }
      });
    }

    if (allTags.size === 0) {
      customMessage.info("选定的知识库中没有标签");
      return;
    }

    const tags = Array.from(allTags);
    store.indexingProgress = {
      total: tags.length,
      current: 0,
      isIndexing: true,
      shouldStop: false,
      failedDetails: new Map(),
    };

    try {
      // syncGlobalTags 内部已经实现了基于 batchSize 的分批和并发处理
      await syncGlobalTags({
        tags,
        comboId,
        profile,
        requestSettings: store.config.embeddingRequestSettings,
        shouldStop: () => store.indexingProgress.shouldStop,
        onProgress: (processed) => {
          store.indexingProgress.current += processed;
        },
      });
      store.indexingProgress.current = tags.length;
      customMessage.success(`标签向量化完成，共处理 ${tags.length} 个标签`);
    } finally {
      store.indexingProgress.isIndexing = false;
    }
  }

  /**
   * 批量生成标签
   */
  async function batchGenerateTags(entryIds: string[], options: { force?: boolean } = {}) {
    if (!store.activeBaseId || !store.activeBaseMeta || entryIds.length === 0) return;

    const config = store.config.tagGeneration;
    if (!config.enabled || !config.modelId) {
      customMessage.warning("请先在设置中启用标签生成并配置模型");
      return;
    }

    const [profileId] = config.modelId.split(":");
    const { profiles } = useLlmProfiles();
    const { sendRequest } = useLlmRequest();
    const profile = profiles.value.find((p) => p.id === profileId);

    if (!profile) {
      customMessage.error("未找到对应的模型配置 Profile");
      return;
    }

    const tasks: string[] = [];
    for (const id of entryIds) {
      const entry = store.activeBaseMeta.entries.find((e) => e.id === id);
      if (!entry) continue;
      if (!options.force && entry.tags && entry.tags.length > 0) continue;
      tasks.push(id);
    }

    if (tasks.length === 0) {
      customMessage.info("没有需要生成标签的条目");
      return;
    }

    store.indexingProgress = {
      total: tasks.length,
      current: 0,
      isIndexing: true,
      shouldStop: false,
      failedDetails: new Map(),
    };

    const maxConcurrent = config.requestSettings?.maxConcurrent ?? 3;
    const queue = [...tasks];

    try {
      const workers = Array(Math.min(maxConcurrent, queue.length))
        .fill(null)
        .map(async () => {
          while (
            queue.length > 0 &&
            store.indexingProgress.isIndexing &&
            !store.indexingProgress.shouldStop
          ) {
            const id = queue.shift();
            if (!id) break;

            const modelId = getPureModelId(store.config.defaultEmbeddingModel);
            const fullEntry = await kbStorage.loadEntry(store.activeBaseId!, id, modelId);
            if (!fullEntry || !fullEntry.content) {
              store.indexingProgress.current++;
              continue;
            }

            try {
              const newTags = await performGenerateTags({
                content: fullEntry.content,
                config,
                profile,
                sendRequest,
              });

              const merged = mergeTags(fullEntry.tags || [], newTags);

              // 这里我们需要一个 updateEntry 的逻辑，为了避免循环依赖，我们直接在这里实现简易版或者通过 store
              // 考虑到 updateEntry 逻辑较重，我们直接调用后端 invoke
              const updated: any = { ...fullEntry, tags: merged, updatedAt: Date.now() };
              await kbStorage.saveEntry(store.activeBaseId!, updated);

              // 更新元数据
              const idx = store.activeBaseMeta!.entries.findIndex((e) => e.id === id);
              if (idx !== -1) {
                store.activeBaseMeta!.entries[idx].tags = merged.map((t) =>
                  typeof t === "string" ? t : t.name
                );
                store.activeBaseMeta!.entries[idx].updatedAt = updated.updatedAt;
                await store.syncBaseMeta();
              }
              store.entriesCache.set(id, updated);
            } catch (e) {
              errorHandler.handle(e, {
                userMessage: `条目 [${fullEntry.key}] 标签生成失败`,
                showToUser: false,
              });
            }
            store.indexingProgress.current++;
          }
        });

      await Promise.all(workers);
      customMessage.success(`标签生成完成: ${store.indexingProgress.current}/${tasks.length}`);
    } finally {
      store.indexingProgress.isIndexing = false;
      await store.loadBases();
    }
  }

  return {
    updateVectors,
    syncAllBases,
    batchVectorizeTags,
    batchGenerateTags,
  };
}
