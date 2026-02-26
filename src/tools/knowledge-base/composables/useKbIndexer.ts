import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { performIndexEntry, performDimensionDetection } from "../core/kbIndexer";
import { kbStorage } from "../utils/kbStorage";
import type { LlmProfile } from "@/types/llm-profiles";
import { calculateHash } from "../utils/kbUtils";
import { getPureModelId, getProfileId, parseModelCombo } from "@/utils/modelIdUtils";

const errorHandler = createModuleErrorHandler("useKbIndexer");
const logger = createModuleLogger("useKbIndexer");

export function useKbIndexer() {
  const store = useKnowledgeBaseStore();
  const { profiles } = useLlmProfiles();

  /**
   * 探测模型维度
   */
  async function detectDimension() {
    const comboId = store.config.defaultEmbeddingModel;
    if (!comboId) {
      customMessage.warning("请先选择一个 Embedding 模型");
      return;
    }

    store.loading = true;
    try {
      const [profileId, modelId] = parseModelCombo(comboId);
      const profile = profiles.value.find((p: LlmProfile) => p.id === profileId);
      if (!profile) throw new Error("未找到对应模型的配置 Profile");

      const dim = await performDimensionDetection({ profile, modelId });
      store.config.vectorIndex.dimension = dim;
      customMessage.success(`探测成功：模型维度为 ${dim}`);
      await store.saveWorkspace();
    } catch (error) {
      errorHandler.error(error, "探测模型维度失败");
    } finally {
      store.loading = false;
    }
  }

  /**
   * 索引单个条目
   */
  async function indexEntry(caiuId: string, silent = false) {
    if (!store.activeBaseId) return false;

    const entry = await store.getOrLoadEntry(caiuId);
    if (!entry || !entry.content) {
      if (!silent) customMessage.warning("条目内容为空，无法向量化");
      return false;
    }

    const comboId = store.config.defaultEmbeddingModel;
    if (!comboId) {
      if (!silent) customMessage.warning("请先在设置中选择 Embedding 模型");
      return false;
    }

    const currentHash = entry.contentHash || (await calculateHash(entry.content));
    
    // 检查内容哈希是否一致（如果后端索引存在，且哈希没变，则跳过）
    // 注意：这里我们假设如果 vectorizedIds 包含该 ID，说明索引文件存在
    // TODO: 后端其实也可以根据 contentHash 决定是否重新生成向量
    if (store.vectorizedIds.has(caiuId) && entry.contentHash === currentHash) {
      logger.info("内容未变化且索引已就绪，跳过向量化", { caiuId });
      return true;
    }

    // 只有在非静默模式下才触发全局 loading
    if (!silent) store.loading = true;

    // 更新内存状态
    store.pendingIds.add(caiuId);
    store.failedIds.delete(caiuId);

    try {
      const profileId = getProfileId(comboId);
      const profile = profiles.value.find((p: LlmProfile) => p.id === profileId);
      if (!profile) throw new Error("未找到模型配置 Profile");

      await performIndexEntry({
        kbId: store.activeBaseId,
        entry,
        comboId,
        profile,
        requestSettings: store.config.embeddingRequestSettings,
      });

      // 更新条目内容哈希 (这是唯一需要持久化在条目里的状态)
      entry.contentHash = currentHash;
      await kbStorage.saveEntry(store.activeBaseId, entry);

      // 更新内存状态集合
      store.vectorizedIds.add(caiuId);
      store.pendingIds.delete(caiuId);

      // 触发全局统计刷新
      await store.updateGlobalStats(true);

      store.entriesCache.set(caiuId, entry);
      logger.info("条目向量化成功", { caiuId, model: comboId });
      return true;
    } catch (e) {
      // 失败时更新状态
      store.pendingIds.delete(caiuId);
      store.failedIds.add(caiuId);

      if (!silent) {
        errorHandler.error(e, "条目向量化失败");
      } else {
        logger.error(`条目向量化失败: ${caiuId}`, e as Error);
      }
      return false;
    } finally {
      if (!silent) store.loading = false;
    }
  }

  /**
   * 批量索引所有待处理条目
   */
  async function indexAllPendingEntries() {
    if (!store.activeBaseId || !store.activeBaseMeta) return;

    const comboId = store.config.defaultEmbeddingModel;
    if (!comboId) {
      customMessage.warning("请先在设置中选择 Embedding 模型");
      return;
    }

    const modelId = getPureModelId(comboId);
    const pendingEntries = store.activeBaseMeta.entries.filter((e) => {
      // 1. 如果不在已向量化集合中，说明索引文件不存在
      if (!store.vectorizedIds.has(e.id)) return true;
      
      // 2. 检查 vectorizedModels，如果当前模型不在其中，说明没有当前模型的向量
      if (!e.vectorizedModels?.includes(modelId)) return true;
      
      // 3. 如果内容哈希不存在，说明需要重新计算哈希并可能重新向量化
      if (!e.contentHash) return true;
      
      return false;
    });

    if (pendingEntries.length === 0) {
      customMessage.info("当前知识库所有条目已是最新向量化状态");
      return;
    }

    store.loading = true;
    store.indexingProgress = {
      total: pendingEntries.length,
      current: 0,
      isIndexing: true,
      shouldStop: false,
      failedDetails: new Map(),
    };

    let successCount = 0;
    let failCount = 0;
    const maxConcurrent = store.config.embeddingRequestSettings?.maxConcurrent ?? 5;

    try {
      // 并发控制实现
      const queue = [...pendingEntries];
      const workers = Array(Math.min(maxConcurrent, queue.length))
        .fill(null)
        .map(async () => {
          while (queue.length > 0) {
            // 检查停止标志
            if (store.indexingProgress.shouldStop) {
              logger.info("索引任务已由用户手动停止");
              break;
            }

            const entryIndex = queue.shift();
            if (!entryIndex) break;

            const success = await indexEntry(entryIndex.id, true);
            if (success) {
              successCount++;
            } else {
              failCount++;
            }
            store.indexingProgress.current++;
          }
        });

      await Promise.all(workers);

      if (store.indexingProgress.shouldStop) {
        customMessage.warning(`处理已停止：已完成 ${successCount} 项，剩余 ${queue.length} 项`);
      } else if (successCount > 0) {
        customMessage.success(
          `批量处理完成：成功 ${successCount} 项` + (failCount > 0 ? `，失败 ${failCount} 项` : "")
        );
      } else if (failCount > 0) {
        customMessage.error(`批量处理失败：共 ${failCount} 项处理失败`);
      }
    } finally {
      store.loading = false;
      store.indexingProgress.isIndexing = false;
    }
  }

  return {
    detectDimension,
    indexEntry,
    indexAllPendingEntries,
  };
}
