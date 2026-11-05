// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

import { randomUUID } from "node:crypto";
import type { RecallMonitorMessage } from "../src/tools/recall/types/monitor";
import type { RecallPipelineRunResponse } from "../src/tools/recall/types/pipeline";

export function pipelineMonitor(
  request: Record<string, unknown>,
  response: RecallPipelineRunResponse,
  duration: number
): RecallMonitorMessage {
  const filters = request.filters as { recallIds?: string[] } | undefined;
  const bundle = request.bundle as { embeddingSpace?: string } | undefined;
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    level: response.outcome === "fallback" ? "warn"
      : response.outcome === "failed" || response.outcome === "cancelled" ? "error" : "success",
    title: "检索管线运行完成",
    summary: `${response.requestedPresetId} -> ${response.actualPresetId} · ${response.outcome} · ${response.results.length} 个结果`,
    module: "RetrievalPipeline",
    type: "RAG",
    payload: {
      steps: (response.trace?.steps ?? []).map((step) => ({
        name: `${step.phase} · ${step.moduleId}`,
        status: step.status,
        duration: step.durationMs,
        details: [
          step.inputCount != null ? `input=${step.inputCount}` : undefined,
          step.outputCount != null ? `output=${step.outputCount}` : undefined,
          step.candidateTrimmed != null ? `trimmed=${step.candidateTrimmed}` : undefined,
          step.reason,
        ].filter(Boolean).join(" · ") || undefined,
      })),
      results: response.results.slice(0, 10).map((result) => ({
        id: result.entry.id,
        score: result.score,
        content: Array.from(result.entry.content).slice(0, 200).join(""),
        source: result.recallName,
        metadata: {
          scoreSemantics: "ranking-score",
          relevanceScore: (result.signals ?? []).reduce((sum, signal) => sum + signal.score, 0),
          matchType: result.matchType,
          signals: result.signals,
        },
      })),
      stats: { duration, hitCount: response.results.length, recallCount: response.results.length },
      metadata: {
        query: typeof request.query === "string" ? request.query : "",
        modelId: bundle?.embeddingSpace ?? "",
        recallIds: filters?.recallIds ?? [],
        executionPath: "retrieval-pipeline",
        runId: response.runId,
        requestedPresetId: response.requestedPresetId,
        actualPresetId: response.actualPresetId,
        outcome: response.outcome,
      },
      pipelineTrace: response.trace ?? undefined,
      pipelineError: response.error ?? undefined,
    },
  };
}

export function monitorHeartbeat(): RecallMonitorMessage {
  return {
    id: randomUUID(), timestamp: Date.now(), level: "info", title: "心跳消息",
    summary: "监控系统运行中", module: "System", type: "System",
    payload: { metadata: { heartbeat: true } },
  };
}
