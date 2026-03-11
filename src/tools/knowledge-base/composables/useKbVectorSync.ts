import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useNotification } from "@/composables/useNotification";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { kbStorage } from "../utils/kbStorage";
import { getPureModelId, getProfileId, parseModelCombo } from "@/utils/modelIdUtils";
import { performGenerateTags, mergeTags } from "../core/tagGenerator";
import { TauriBackendAdapter } from "../logic/adapters/BackendAdapter";
import { IndexingOrchestrator } from "../logic/orchestrators/IndexingOrchestrator";
import { VectorSyncManager } from "../logic/orchestrators/VectorSyncManager";

const errorHandler = createModuleErrorHandler("useKbVectorSync");
const logger = createModuleLogger("useKbVectorSync");
const adapter = new TauriBackendAdapter();

export function useKbVectorSync() {
  const store = useKnowledgeBaseStore();
  const notify = useNotification();
  const orchestrator = new IndexingOrchestrator(adapter, {
    requestSettings: store.config.embeddingRequestSettings,
  });
  const syncManager = new VectorSyncManager(adapter, orchestrator);

  /**
   * 批量更新向量
   */
  async function updateVectors(kbIds?: string[], entryIds?: string[], options: { customComboId?: string } = {}) {
    const comboId = options.customComboId || store.config.defaultEmbeddingModel;
    if (!comboId) {
      customMessage.warning("请先在设置中配置默认 Embedding 模型");
      return;
    }

    const [profileId, pureModelId] = parseModelCombo(comboId);
    const { profiles } = useLlmProfiles();
    const profile = profiles.value.find((p) => p.id === profileId);
    if (!profile) {
      customMessage.error("未找到对应的模型配置 Profile");
      return;
    }

    // 1. 收集任务 (使用 Logic 层能力)
    let missingMap: [string, string][] = [];
    if (entryIds && store.activeBaseId) {
      missingMap = entryIds.map((id) => [store.activeBaseId!, id]);
    } else {
      const targetKbIds = kbIds || (store.activeBaseId ? [store.activeBaseId] : []);
      if (targetKbIds.length === 0) return;
      const coverage = await syncManager.checkCoverage({ kbIds: targetKbIds, modelId: pureModelId });
      missingMap = coverage.missingMap;
    }

    if (missingMap.length === 0) {
      if (!entryIds) customMessage.info("所有条目已是最新向量化状态");
      return;
    }

    store.indexingProgress = {
      total: missingMap.length,
      current: 0,
      isIndexing: true,
      shouldStop: false,
      failedDetails: new Map(),
    };

    try {
      await syncManager.syncMissingVectors({
        missingMap,
        modelId: pureModelId,
        profile,
        onProgress: (p) => {
          store.indexingProgress.current = p.current;
        },
        shouldStop: () => store.indexingProgress.shouldStop,
      });

      if (store.indexingProgress.shouldStop) {
        notify.warning("进度已手动停止", `共处理 ${store.indexingProgress.current} 项`);
      } else {
        notify.success("向量化任务全部完成", `成功补齐了 ${store.indexingProgress.total} 项索引。`, {
          source: "knowledge-base",
        });
      }
    } catch (e) {
      errorHandler.error(e, "向量同步任务执行异常");
    } finally {
      store.indexingProgress.isIndexing = false;
      await store.validateVectorStatus();
      await store.updateGlobalStats(true);
    }
  }

  /**
   * 一键同步所有知识库
   */
  async function syncAllBases() {
    if (store.indexingProgress.isIndexing) return;
    const kbIds = store.bases.map((b) => b.id);
    await updateVectors(kbIds);
  }

  /**
   * 批量向量化标签
   */
  async function batchVectorizeTags(kbIds: string[]) {
    if (kbIds.length === 0) return;
    const comboId = store.config.defaultEmbeddingModel;
    if (!comboId) return;

    const [profileId] = comboId.split(":");
    const { profiles } = useLlmProfiles();
    const profile = profiles.value.find((p) => p.id === profileId);
    if (!profile) return;

    const allTags = new Set<string>();
    const pureModelId = getPureModelId(comboId);

    // 收集所有标签
    for (const id of kbIds) {
      const meta = await adapter.loadBaseMeta(id, pureModelId);
      if (!meta) continue;
      meta.entries.forEach((e) => e.tags?.forEach((t) => allTags.add(t)));
    }

    if (allTags.size === 0) return;

    store.indexingProgress = {
      total: allTags.size,
      current: 0,
      isIndexing: true,
      shouldStop: false,
      failedDetails: new Map(),
    };

    try {
      await orchestrator.syncTags({
        tags: Array.from(allTags),
        modelId: pureModelId,
        profile,
        shouldStop: () => store.indexingProgress.shouldStop,
        onProgress: (processed) => {
          store.indexingProgress.current += processed;
        },
      });
      customMessage.success("标签池向量同步任务已完成");
    } finally {
      store.indexingProgress.isIndexing = false;
      await store.updateGlobalStats(true);
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

    const { profiles } = useLlmProfiles();
    const { sendRequest } = useLlmRequest();
    const profile = profiles.value.find((p) => p.id === getProfileId(config.modelId));
    if (!profile) return;

    const tasks = entryIds.filter((id) => {
      const entry = store.activeBaseMeta!.entries.find((e) => e.id === id);
      return entry && (options.force || !entry.tags || entry.tags.length === 0);
    });

    if (tasks.length === 0) return;

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
          while (queue.length > 0 && !store.indexingProgress.shouldStop) {
            const id = queue.shift();
            if (!id) break;

            try {
              const fullEntry = await adapter.loadEntry(store.activeBaseId!, id);
              if (!fullEntry || !fullEntry.content) continue;

              const newTags = await performGenerateTags({
                content: fullEntry.content,
                config,
                profile,
                sendRequest,
              });

              const merged = mergeTags(fullEntry.tags || [], newTags);
              const updated = { ...fullEntry, tags: merged, updatedAt: Date.now() };

              await kbStorage.saveEntry(store.activeBaseId!, updated);

              // 同步 UI 状态
              const idx = store.activeBaseMeta!.entries.findIndex((e) => e.id === id);
              if (idx !== -1) {
                store.activeBaseMeta!.entries[idx].tags = merged.map((t) => (typeof t === "string" ? t : t.name));
                store.activeBaseMeta!.entries[idx].updatedAt = updated.updatedAt;
              }
              store.entriesCache.set(id, updated);
            } catch (e) {
              logger.error(`条目[${id}]生成标签失败`, e);
            } finally {
              store.indexingProgress.current++;
            }
          }
        });

      await Promise.all(workers);
      customMessage.success("标签批量生成任务结束");
    } finally {
      store.indexingProgress.isIndexing = false;
      await store.syncBaseMeta();
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
