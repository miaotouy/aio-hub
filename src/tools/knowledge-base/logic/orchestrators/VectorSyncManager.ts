import type { LlmProfile } from "@/types/llm-profiles";
import type { BackendAdapter } from "../adapters/BackendAdapter";
import type { IndexingOrchestrator } from "./IndexingOrchestrator";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("kb-vector-sync-manager");

export interface SyncProgress {
  total: number;
  current: number;
}

/**
 * 向量同步管理器 (Logic 层)
 * 职责: 处理多库向量一致性检查与自动补全任务
 */
export class VectorSyncManager {
  constructor(
    private adapter: BackendAdapter,
    private indexingOrchestrator: IndexingOrchestrator
  ) {}

  /**
   * 检查指定知识库在特定模型下的向量覆盖率
   */
  async checkCoverage(params: { kbIds: string[]; modelId: string }) {
    const { kbIds, modelId } = params;
    const report = await this.adapter.checkVectorCoverage({ kbIds, modelId });

    return {
      missingEntries: report.missingEntries as number,
      missingMap: report.missingMap as [string, string][], // [kbId, caiuId][]
    };
  }

  /**
   * 执行自动补全同步
   */
  async syncMissingVectors(params: {
    missingMap: [string, string][];
    modelId: string;
    profile: LlmProfile;
    onProgress?: (progress: SyncProgress) => void;
    shouldStop?: () => boolean;
  }) {
    const { missingMap, modelId, profile, onProgress, shouldStop } = params;
    const total = missingMap.length;
    let current = 0;

    logger.info(`开始全自动补全向量，共 ${total} 项`, { modelId });

    for (let i = 0; i < total; i++) {
      if (shouldStop?.()) break;

      const [kbId, caiuId] = missingMap[i];
      try {
        // 加载条目内容
        const entry = await this.adapter.loadEntry(kbId, caiuId);
        if (entry) {
          // 调用现有的 IndexingOrchestrator 单条索引逻辑
          await this.indexingOrchestrator.indexEntry({
            kbId,
            entry,
            modelId,
            profile,
          });
        }
      } catch (error) {
        logger.error(`条目[${caiuId}]自动同步失败`, error);
      } finally {
        current++;
        onProgress?.({ total, current });
      }
    }

    logger.info(`向量自动补全任务结束`, { modelId, completed: current });
  }
}
