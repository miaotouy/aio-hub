// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { invoke } from "@tauri-apps/api/core";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { getProfileId, getPureModelId } from "@/utils/modelIdUtils";
import { createModuleLogger } from "@/utils/logger";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import type { RecallResult } from "../types/search";
import type {
  RecallPipelineCompileResult,
  RecallPresetId,
  RecallPresetSummary,
} from "../types/pipeline";
import { vectorCacheManager } from "../utils/vectorCache";
import { resolveEmbeddingAssetGeneration } from "../core/embeddingAssetGeneration";

export type { RecallPresetId } from "../types/pipeline";

export interface RetrievalPipelineSearchParams {
  query: string;
  secondaryQuery?: string;
  fusionWeights?: [number, number];
  recallIds: string[];
  tags?: string[];
  limit?: number;
  minScore?: number;
  presetId: RecallPresetId;
  fallbackPresetId?: "algorithmic";
}

export interface CompiledRetrievalPipeline {
  presetId: RecallPresetId;
  runId: string;
  result: RecallPipelineCompileResult;
}

export interface RetrievalPipelineLifecycleObserver {
  onPreparing?: (compilation: CompiledRetrievalPipeline) => void;
  onRunning?: (compilation: CompiledRetrievalPipeline) => void;
}

interface PipelineRunResponse {
  outcome: "success" | "empty" | "fallback" | "failed" | "cancelled";
  results: RecallResult[];
  configHash: string;
  requestedPresetId?: RecallPresetId;
  actualPresetId?: RecallPresetId;
  trace?: unknown;
  error?: { code: string; message: string };
}

const logger = createModuleLogger("recall/retrieval-pipeline");

export class RetrievalPipelineBlockingError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "RetrievalPipelineBlockingError";
  }
}

function newRunId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `recall-${Date.now()}-${Math.random()}`
  );
}

function assertValidCompilation(result: RecallPipelineCompileResult) {
  if (!result.valid) {
    throw new RetrievalPipelineBlockingError(
      result.issues.map((issue) => issue.message).join("；") ||
        "检索管线编译失败。",
      "pipeline-compile-failed"
    );
  }
}

export async function listRetrievalPresets(): Promise<RecallPresetSummary[]> {
  return invoke<RecallPresetSummary[]>("recall_list_retrieval_presets");
}

export async function inspectRetrievalPipeline(
  presetId: RecallPresetId,
  limit?: number
): Promise<CompiledRetrievalPipeline> {
  const runId = newRunId();
  const result = await invoke<RecallPipelineCompileResult>(
    "recall_compile_retrieval_pipeline",
    { presetId, runId, limit }
  );
  return { presetId, runId, result };
}

export async function compileRetrievalPipeline(
  presetId: RecallPresetId,
  limit?: number
): Promise<CompiledRetrievalPipeline> {
  const compilation = await inspectRetrievalPipeline(presetId, limit);
  const { result } = compilation;
  assertValidCompilation(result);
  return compilation;
}

function normalizeWeights(
  weights: [number, number] | undefined
): [number, number] {
  const value = weights ?? [0.7, 0.3];
  const total = value[0] + value[1];
  if (
    !value.every((weight) => Number.isFinite(weight) && weight >= 0) ||
    total <= 0
  ) {
    return [0.7, 0.3];
  }
  return [value[0] / total, value[1] / total];
}

function mergeVectors(vectors: number[][], weights: number[]) {
  const result = new Array<number>(vectors[0].length).fill(0);
  vectors.forEach((vector, index) => {
    vector.forEach((value, dimension) => {
      result[dimension] += value * weights[index];
    });
  });
  return result;
}

async function prepareQueryEmbedding(
  query: string,
  secondaryQuery: string,
  weights: [number, number]
) {
  const store = useRecallCollectionStore();
  const comboId = store.config?.defaultEmbeddingModel || "";
  const modelId = getPureModelId(comboId);
  const profileId = getProfileId(comboId);
  const profile = useLlmProfiles().profiles.value.find(
    (item) => item.id === profileId
  );
  if (!modelId || !profile) {
    throw new RetrievalPipelineBlockingError(
      "综合召回需要配置可用的 Embedding 模型和 Profile。",
      "query-embedding-unconfigured"
    );
  }
  const primary = query
    ? await vectorCacheManager.getVector(query, profile, modelId)
    : null;
  const secondary = secondaryQuery
    ? await vectorCacheManager.getVector(secondaryQuery, profile, modelId)
    : null;
  const embedding =
    primary && secondary
      ? mergeVectors([primary, secondary], weights)
      : (primary ?? secondary);
  if (!embedding) {
    throw new RetrievalPipelineBlockingError(
      "无法准备综合召回所需的查询向量。",
      "query-embedding-unavailable"
    );
  }
  return {
    embedding,
    modelId,
    modelSignature: comboId,
    assetGeneration: resolveEmbeddingAssetGeneration(store.config),
  };
}

export async function executeRetrievalPipeline(
  params: RetrievalPipelineSearchParams,
  compiled?: CompiledRetrievalPipeline,
  observer?: RetrievalPipelineLifecycleObserver
): Promise<{
  runId?: string;
  results: RecallResult[];
  configHash: string;
  outcome?: PipelineRunResponse["outcome"];
  requestedPresetId?: RecallPresetId;
  actualPresetId?: RecallPresetId;
  trace?: unknown;
}> {
  if (!params.query.trim()) return { results: [], configHash: "empty-query" };
  if (!params.recallIds.length) {
    throw new RetrievalPipelineBlockingError(
      "请先选择至少一个思绪集。",
      "recall-ids-missing"
    );
  }
  const compilation =
    compiled ?? (await compileRetrievalPipeline(params.presetId, params.limit));
  if (compilation.presetId !== params.presetId) {
    throw new RetrievalPipelineBlockingError(
      "编译后的检索预设与运行请求不一致。",
      "pipeline-preset-mismatch"
    );
  }
  let activeCompilation = compilation;
  let actualPresetId = params.presetId;
  let fallbackReason: string | undefined;
  let bundle: Record<string, unknown> | undefined;
  observer?.onPreparing?.(activeCompilation);
  try {
    const needsEmbedding = activeCompilation.result.externalRequirements.some(
      (requirement) => requirement.kind === "query-embedding"
    );
    if (needsEmbedding) {
      const weights = normalizeWeights(params.fusionWeights);
      const prepared = await prepareQueryEmbedding(
        params.query,
        params.secondaryQuery ?? "",
        weights
      );
      for (const recallId of params.recallIds) {
        await invoke("recall_load_model_vectors", {
          recallId,
          modelId: prepared.modelId,
        });
      }
      await invoke("recall_rebuild_tag_pool_index", {
        modelId: prepared.modelId,
      });
      bundle = {
        bundleId: `${activeCompilation.runId}:${prepared.modelId}`,
        embeddingSpace: prepared.modelId,
        modelSignature: prepared.modelSignature,
        assetGeneration: prepared.assetGeneration,
        algorithmVersion: activeCompilation.result.algorithmVersion,
        queryEmbedding: prepared.embedding,
      };
    }
  } catch (error) {
    const canFallback =
      params.presetId === "comprehensive" &&
      params.fallbackPresetId === "algorithmic";
    if (!canFallback) throw error;
    fallbackReason =
      error instanceof RetrievalPipelineBlockingError
        ? error.code
        : "external-artifact-prepare-failed";
    actualPresetId = "algorithmic";
    activeCompilation = await compileRetrievalPipeline(
      actualPresetId,
      params.limit
    );
    bundle = undefined;
  }
  const { runId, result: compileResult } = activeCompilation;
  observer?.onRunning?.(activeCompilation);
  const response = await invoke<PipelineRunResponse>(
    "recall_run_retrieval_pipeline",
    {
      request: {
        query: params.query,
        filters: {
          recallIds: params.recallIds,
          tags: params.tags,
          limit: params.limit,
          minScore: params.minScore,
          enabledOnly: true,
        },
        presetId: actualPresetId,
        requestedPresetId: params.presetId,
        fallbackPresetId: params.fallbackPresetId,
        fallbackReason,
        runId,
        configHash: compileResult.configHash,
        bundle,
      },
    }
  );
  if (response.outcome === "failed" || response.outcome === "cancelled") {
    throw new RetrievalPipelineBlockingError(
      response.error?.message || "检索管线执行失败。",
      response.error?.code || "pipeline-run-failed"
    );
  }
  logger.info("检索管线执行完成", {
    presetId: params.presetId,
    resultCount: response.results.length,
    configHash: response.configHash,
  });
  return {
    runId,
    results: response.results,
    configHash: response.configHash,
    outcome: response.outcome,
    requestedPresetId: response.requestedPresetId ?? params.presetId,
    actualPresetId: response.actualPresetId ?? actualPresetId,
    trace: response.trace,
  };
}
