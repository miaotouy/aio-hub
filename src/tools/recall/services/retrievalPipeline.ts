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
  RecallPipelineExecutionId,
  RecallPipelineRunResponse,
  RecallPipelineTraceV1,
  RecallPresetId,
  RecallPresetSummary,
  RecallRetrievalModuleInfo,
  RecallRetrievalPipelineV1,
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

export interface CompiledCustomRetrievalPipeline {
  executionId: "custom";
  pipeline: RecallRetrievalPipelineV1;
  runId: string;
  result: RecallPipelineCompileResult;
}

export type AnyCompiledRetrievalPipeline =
  CompiledRetrievalPipeline | CompiledCustomRetrievalPipeline;

export interface RetrievalPipelineLifecycleObserver {
  onPreparing?: (compilation: AnyCompiledRetrievalPipeline) => void;
  onRunning?: (compilation: AnyCompiledRetrievalPipeline) => void;
}

export interface CustomRetrievalPipelineSearchParams {
  query: string;
  secondaryQuery?: string;
  fusionWeights?: [number, number];
  recallIds: string[];
  tags?: string[];
  minScore?: number;
  pipeline: RecallRetrievalPipelineV1;
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

export async function listRetrievalModules(): Promise<
  RecallRetrievalModuleInfo[]
> {
  return invoke<RecallRetrievalModuleInfo[]>("recall_list_retrieval_modules");
}

export async function getRetrievalPipelineTemplate(
  presetId: RecallPresetId,
  limit?: number
): Promise<RecallRetrievalPipelineV1> {
  return invoke<RecallRetrievalPipelineV1>(
    "recall_get_retrieval_pipeline_template",
    { presetId, limit }
  );
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

export async function inspectCustomRetrievalPipeline(
  pipeline: RecallRetrievalPipelineV1
): Promise<CompiledCustomRetrievalPipeline> {
  const runId = newRunId();
  const result = await invoke<RecallPipelineCompileResult>(
    "recall_compile_custom_retrieval_pipeline",
    { pipeline, runId }
  );
  return { executionId: "custom", pipeline, runId, result };
}

export async function compileCustomRetrievalPipeline(
  pipeline: RecallRetrievalPipelineV1
): Promise<CompiledCustomRetrievalPipeline> {
  const compilation = await inspectCustomRetrievalPipeline(pipeline);
  assertValidCompilation(compilation.result);
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

async function preparePipelineBundle(
  compilation: AnyCompiledRetrievalPipeline,
  params: {
    query: string;
    secondaryQuery?: string;
    fusionWeights?: [number, number];
    recallIds: string[];
  }
): Promise<Record<string, unknown> | undefined> {
  const needsEmbedding = compilation.result.externalRequirements.some(
    (requirement) => requirement.kind === "query-embedding"
  );
  if (!needsEmbedding) return undefined;

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
  return {
    bundleId: `${compilation.runId}:${prepared.modelId}`,
    embeddingSpace: prepared.modelId,
    modelSignature: prepared.modelSignature,
    assetGeneration: prepared.assetGeneration,
    algorithmVersion: compilation.result.algorithmVersion,
    queryEmbedding: prepared.embedding,
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
  outcome?: RecallPipelineRunResponse["outcome"];
  requestedPresetId?: RecallPipelineExecutionId;
  actualPresetId?: RecallPipelineExecutionId;
  trace?: RecallPipelineTraceV1;
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
    bundle = await preparePipelineBundle(activeCompilation, params);
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
  const response = await invoke<RecallPipelineRunResponse>(
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

export async function executeCustomRetrievalPipeline(
  params: CustomRetrievalPipelineSearchParams,
  compiled?: CompiledCustomRetrievalPipeline,
  observer?: RetrievalPipelineLifecycleObserver
): Promise<{
  runId: string;
  results: RecallResult[];
  configHash: string;
  outcome: RecallPipelineRunResponse["outcome"];
  requestedPresetId: RecallPipelineExecutionId;
  actualPresetId: RecallPipelineExecutionId;
  trace?: RecallPipelineTraceV1;
}> {
  if (!params.query.trim()) {
    throw new RetrievalPipelineBlockingError(
      "自定义管线需要非空查询。",
      "query-missing"
    );
  }
  if (!params.recallIds.length) {
    throw new RetrievalPipelineBlockingError(
      "请先选择至少一个思绪集。",
      "recall-ids-missing"
    );
  }
  const compilation =
    compiled ?? (await compileCustomRetrievalPipeline(params.pipeline));
  assertValidCompilation(compilation.result);
  observer?.onPreparing?.(compilation);
  const bundle = await preparePipelineBundle(compilation, params);
  observer?.onRunning?.(compilation);
  const response = await invoke<RecallPipelineRunResponse>(
    "recall_run_custom_retrieval_pipeline",
    {
      request: {
        query: params.query,
        filters: {
          recallIds: params.recallIds,
          tags: params.tags,
          minScore: params.minScore,
          enabledOnly: true,
        },
        pipeline: params.pipeline,
        runId: compilation.runId,
        configHash: compilation.result.configHash,
        bundle,
      },
    }
  );
  if (response.outcome === "failed" || response.outcome === "cancelled") {
    throw new RetrievalPipelineBlockingError(
      response.error?.message || "自定义检索管线执行失败。",
      response.error?.code || "pipeline-run-failed"
    );
  }
  logger.info("自定义检索管线执行完成", {
    resultCount: response.results.length,
    configHash: response.configHash,
  });
  return {
    runId: response.runId,
    results: response.results,
    configHash: response.configHash,
    outcome: response.outcome,
    requestedPresetId: response.requestedPresetId,
    actualPresetId: response.actualPresetId,
    trace: response.trace,
  };
}
