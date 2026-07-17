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

import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { detectDimension as coreDetectDimension } from "../core/embedding";
import { recallStorage } from "../utils/recallStorage";
import type { LlmProfile } from "@/types/llm-profiles";
import { calculateHash } from "../utils/recallUtils";
import {
  getPureModelId,
  getProfileId,
  parseModelCombo,
} from "@/utils/modelIdUtils";
import { IndexingOrchestrator } from "../logic/orchestrator";

const errorHandler = createModuleErrorHandler("useRecallIndexer");
const logger = createModuleLogger("useRecallIndexer");

export function useRecallIndexer() {
  const store = useRecallCollectionStore();
  const { profiles } = useLlmProfiles();

  const orchestrator = new IndexingOrchestrator({
    requestSettings: store.config.embeddingRequestSettings,
  });

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
      const profile = profiles.value.find(
        (p: LlmProfile) => p.id === profileId
      );
      if (!profile) throw new Error("未找到对应模型的配置 Profile");

      const dim = await coreDetectDimension({ profile, modelId });
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
  async function indexEntry(entryId: string, silent = false) {
    if (!store.activeBaseId) return false;

    const entry = await store.getOrLoadEntry(entryId);
    if (!entry || !entry.content) {
      if (!silent) customMessage.warning("条目内容为空，无法向量化");
      return false;
    }

    const comboId = store.config.defaultEmbeddingModel;
    if (!comboId) {
      if (!silent) customMessage.warning("请先在设置中选择 Embedding 模型");
      return false;
    }

    const currentHash =
      entry.contentHash || (await calculateHash(entry.content));

    // 检查内容哈希是否一致（如果后端索引存在，且哈希没变，则跳过）
    // 注意：这里我们假设如果 vectorizedIds 包含该 ID，说明索引文件存在
    // TODO: 后端其实也可以根据 contentHash 决定是否重新生成向量
    if (store.vectorizedIds.has(entryId) && entry.contentHash === currentHash) {
      logger.info("内容未变化且索引已就绪，跳过向量化", { entryId });
      return true;
    }

    // 只有在非静默模式下才触发全局 loading
    if (!silent) store.loading = true;

    // 更新内存状态
    store.pendingIds.add(entryId);
    store.failedIds.delete(entryId);

    try {
      const profileId = getProfileId(comboId);
      const profile = profiles.value.find(
        (p: LlmProfile) => p.id === profileId
      );
      if (!profile) throw new Error("未找到模型配置 Profile");

      await orchestrator.indexEntry({
        recallId: store.activeBaseId,
        entry,
        modelId: getPureModelId(comboId),
        profile,
      });

      // 更新条目内容哈希 (这是唯一需要持久化在条目里的状态)
      entry.contentHash = currentHash;
      await recallStorage.saveEntry(store.activeBaseId, entry);

      // 更新内存状态集合
      store.vectorizedIds.add(entryId);
      store.pendingIds.delete(entryId);

      // 触发全局统计刷新
      await store.updateGlobalStats(true);

      store.entriesCache.set(entryId, entry);
      logger.info("条目向量化成功", { entryId, model: comboId });
      return true;
    } catch (e) {
      // 失败时更新状态
      store.pendingIds.delete(entryId);
      store.failedIds.add(entryId);

      if (!silent) {
        errorHandler.error(e, "条目向量化失败");
      } else {
        logger.error(`条目向量化失败: ${entryId}`, e as Error);
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
      customMessage.info("当前思绪集所有条目已是最新向量化状态");
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

    try {
      const profileId = getProfileId(comboId);
      const profile = profiles.value.find(
        (p: LlmProfile) => p.id === profileId
      );
      if (!profile) throw new Error("未找到模型配置 Profile");

      // 直接调用逻辑层进行批量处理
      await orchestrator.indexEntries({
        recallId: store.activeBaseId,
        entryIds: pendingEntries.map((e) => e.id),
        modelId,
        profile,
        shouldStop: () => store.indexingProgress.shouldStop,
        onProgress: async (processed, failed) => {
          store.indexingProgress.current += processed;
          if (failed) {
            failed.forEach((f) =>
              store.indexingProgress.failedDetails.set(f.id, f.reason)
            );
          }
          // 同步更新 Store 中的索引状态集合
          await store.updateGlobalStats(true);
        },
      });

      if (store.indexingProgress.shouldStop) {
        customMessage.warning(
          `处理已停止：当前已完成 ${store.indexingProgress.current} 项`
        );
      } else {
        customMessage.success(
          `批量处理完成：共处理 ${pendingEntries.length} 项`
        );
      }
    } catch (e) {
      errorHandler.error(e, "批量向量化任务执行异常");
    } finally {
      store.loading = false;
      store.indexingProgress.isIndexing = false;
      await store.updateGlobalStats(true);
    }
  }

  return {
    detectDimension,
    indexEntry,
    indexAllPendingEntries,
  };
}
