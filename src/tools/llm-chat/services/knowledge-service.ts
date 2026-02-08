/**
 * 知识库集成服务
 * 提供与后端知识库检索命令的交互封装
 */

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { SearchResult } from "../../knowledge-base/types/search";
import { knowledgeSearchManager } from "../../knowledge-base/core/KnowledgeSearchManager";

const logger = createModuleLogger("llm-chat/knowledge-service");
const errorHandler = createModuleErrorHandler("llm-chat/knowledge-service");

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

        const results = await knowledgeSearchManager.searchWithVector({
          query: params.query,
          vector: params.vector,
          kbIds: params.kbIds,
          tags: params.tags,
          limit: params.limit,
          minScore: params.minScore,
          engineId: params.engineId,
          modelId: params.modelId,
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