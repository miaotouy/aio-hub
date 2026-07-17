import {
  searchWithCache,
  type SearchWithCacheParams,
} from "@/tools/recall/services/api";
import type { RecallResult } from "@/tools/recall/types/search";
import { searchKnowledge } from "@/tools/knowledge-base/service";
import type {
  KnowledgeResult,
  KnowledgeSearchRequest,
} from "@/tools/knowledge-base/types";

export type RetrievalMode = "recall" | "knowledge" | "mixed";

export interface RetrievalFusionTrace {
  method: "single-domain" | "rrf";
  version: "retrieval-router-v1";
  domainRank: number;
  rrfScore?: number;
  rawScore: number;
}

export type RoutedRetrievalResult =
  | {
      sourceType: "recall";
      sourceId: string;
      sourceName: string;
      itemId: string;
      content: string;
      fusion: RetrievalFusionTrace;
      original: RecallResult;
    }
  | {
      sourceType: "knowledge";
      sourceId: string;
      sourceName: string;
      itemId: string;
      content: string;
      sourcePath: string;
      chunkIndex: number;
      heading?: string;
      fusion: RetrievalFusionTrace;
      original: KnowledgeResult;
    };

export interface RetrievalRouterRequest {
  mode: RetrievalMode;
  limit?: number;
  recallQuota?: number;
  knowledgeQuota?: number;
  recall?: SearchWithCacheParams;
  knowledge?: KnowledgeSearchRequest;
}

export interface RetrievalRouterResponse {
  mode: RetrievalMode;
  results: RoutedRetrievalResult[];
  quotas: { recall: number; knowledge: number };
  fusionMethod: "single-domain" | "rrf";
}

function mapRecall(
  results: RecallResult[],
  method: "single-domain" | "rrf"
): RoutedRetrievalResult[] {
  return results.map((result, index) => ({
    sourceType: "recall",
    sourceId: result.recallId,
    sourceName: result.recallName,
    itemId: result.entry.id,
    content: result.entry.content,
    fusion: {
      method,
      version: "retrieval-router-v1",
      domainRank: index + 1,
      rawScore: result.score,
      rrfScore: method === "rrf" ? 1 / (60 + index + 1) : undefined,
    },
    original: result,
  }));
}

function mapKnowledge(
  results: KnowledgeResult[],
  method: "single-domain" | "rrf"
): RoutedRetrievalResult[] {
  return results.map((result, index) => ({
    sourceType: "knowledge",
    sourceId: result.libraryId,
    sourceName: result.libraryName,
    itemId: result.chunkId,
    content: result.content,
    sourcePath: result.sourcePath,
    chunkIndex: result.chunkIndex,
    heading: result.heading,
    fusion: {
      method,
      version: "retrieval-router-v1",
      domainRank: index + 1,
      rawScore: result.score,
      rrfScore: method === "rrf" ? 1 / (60 + index + 1) : undefined,
    },
    original: result,
  }));
}

export async function routeRetrieval(
  request: RetrievalRouterRequest
): Promise<RetrievalRouterResponse> {
  const limit = Math.max(1, request.limit ?? 8);
  if (request.mode === "recall") {
    if (!request.recall) throw new Error("Recall retrieval request 缺失");
    const response = await searchWithCache({ ...request.recall, limit });
    return {
      mode: request.mode,
      results: mapRecall(response.results.slice(0, limit), "single-domain"),
      quotas: { recall: limit, knowledge: 0 },
      fusionMethod: "single-domain",
    };
  }
  if (request.mode === "knowledge") {
    if (!request.knowledge) throw new Error("Knowledge retrieval request 缺失");
    const results = await searchKnowledge({ ...request.knowledge, limit });
    return {
      mode: request.mode,
      results: mapKnowledge(results.slice(0, limit), "single-domain"),
      quotas: { recall: 0, knowledge: limit },
      fusionMethod: "single-domain",
    };
  }
  if (!request.recall || !request.knowledge)
    throw new Error("Mixed retrieval 需要 Recall 和 Knowledge 请求");

  const recallQuota = Math.max(0, request.recallQuota ?? Math.ceil(limit / 2));
  const knowledgeQuota = Math.max(
    0,
    request.knowledgeQuota ?? Math.floor(limit / 2)
  );
  const [recallResponse, knowledgeResults] = await Promise.all([
    searchWithCache({ ...request.recall, limit: recallQuota }),
    searchKnowledge({ ...request.knowledge, limit: knowledgeQuota }),
  ]);
  const fused = [
    ...mapRecall(recallResponse.results.slice(0, recallQuota), "rrf"),
    ...mapKnowledge(knowledgeResults.slice(0, knowledgeQuota), "rrf"),
  ];
  fused.sort(
    (left, right) =>
      (right.fusion.rrfScore ?? 0) - (left.fusion.rrfScore ?? 0) ||
      left.sourceType.localeCompare(right.sourceType) ||
      left.itemId.localeCompare(right.itemId)
  );
  return {
    mode: request.mode,
    results: fused.slice(0, limit),
    quotas: { recall: recallQuota, knowledge: knowledgeQuota },
    fusionMethod: "rrf",
  };
}
