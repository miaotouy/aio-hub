/**
 * 知识库集成服务
 * 提供与后端知识库检索命令的交互封装
 */

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { SearchResult } from "../../knowledge-base/types/search";
import { SearchOrchestrator } from "../../knowledge-base/logic/orchestrator";

const logger = createModuleLogger("llm-chat/knowledge-service");
const errorHandler = createModuleErrorHandler("llm-chat/knowledge-service");

const searchOrchestrator = new SearchOrchestrator();

/**
 * 执行知识库检索
 * 调用后端 kb_search 命令
 */
export async function searchKnowledge(params: {
  query: string;
  kbIds?: string[];
  tags?: string[];
  limit?: number;
  minScore?: number;
  engineId?: string;
  vector?: number[];
  modelId?: string;
}): Promise<SearchResult[]> {
  return (
    (await errorHandler.wrapAsync(
      async () => {
        logger.debug("执行知识库检索", {
          query: params.query,
          kbIds: params.kbIds,
          tags: params.tags,
        });

        const results = await searchOrchestrator.search({
          query: params.query,
          kbIds: params.kbIds || [],
          engineId: params.engineId || "keyword",
          modelId: params.modelId,
          extraFilters: {
            requiredTags: params.tags,
            minScore: params.minScore,
          },
          limit: params.limit,
          vector_payload: params.vector,
          skipPrep: true, // 外部调用跳过环境准备
        });

        logger.debug("知识库检索完成", { count: results.length });
        return results;
      },
      {
        userMessage: "检索知识库失败",
        context: params,
      }
    )) || []
  );
}
