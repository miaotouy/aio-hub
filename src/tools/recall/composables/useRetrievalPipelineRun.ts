// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { computed, ref } from "vue";
import {
  executeRetrievalPipeline,
  inspectRetrievalPipeline,
  type CompiledRetrievalPipeline,
  type RetrievalPipelineSearchParams,
} from "../services/retrievalPipeline";
import {
  canTransitionRecallPipelineUiState,
  isCurrentRecallPipelineResponse,
  type RecallPipelineCompileResult,
  type RecallPipelineRequestIdentity,
  type RecallPipelineUiState,
} from "../types/pipeline";
import type { RecallResult } from "../types/search";

export interface RetrievalPipelineRunSnapshot {
  runId: string;
  configHash: string;
  outcome: "success" | "empty" | "fallback";
  results: RecallResult[];
  requestedPresetId?: string;
  actualPresetId?: string;
  trace?: unknown;
}

export function useRetrievalPipelineRun() {
  const state = ref<RecallPipelineUiState>("idle");
  const compilation = ref<RecallPipelineCompileResult | null>(null);
  const activeIdentity = ref<RecallPipelineRequestIdentity | null>(null);
  const snapshot = ref<RetrievalPipelineRunSnapshot | null>(null);
  const error = ref<Error | null>(null);
  let generation = 0;

  const results = computed(() => snapshot.value?.results ?? []);
  const loading = computed(() =>
    ["compiling", "preparing", "running"].includes(state.value)
  );

  function transition(next: RecallPipelineUiState) {
    if (state.value === next) return;
    if (!canTransitionRecallPipelineUiState(state.value, next)) {
      throw new Error(
        `invalid Recall pipeline UI transition: ${state.value} -> ${next}`
      );
    }
    state.value = next;
  }

  function beginCompilation() {
    if (state.value !== "idle" && state.value !== "compiling") {
      transition("compiling");
    } else if (state.value === "idle") {
      transition("compiling");
    }
  }

  function acceptCompilation(
    requestGeneration: number,
    value: CompiledRetrievalPipeline
  ) {
    if (requestGeneration !== generation) return false;
    compilation.value = value.result;
    activeIdentity.value = {
      runId: value.runId,
      configHash: value.result.configHash,
    };
    if (!value.result.valid) {
      transition("blocked");
      return false;
    }
    transition("ready");
    return true;
  }

  async function run(
    params: RetrievalPipelineSearchParams
  ): Promise<RetrievalPipelineRunSnapshot | null> {
    if (!params.query.trim()) {
      reset();
      return null;
    }
    const requestGeneration = ++generation;
    beginCompilation();
    compilation.value = null;
    activeIdentity.value = null;
    snapshot.value = null;
    error.value = null;

    try {
      const compiled = await inspectRetrievalPipeline(
        params.presetId,
        params.limit
      );
      if (!acceptCompilation(requestGeneration, compiled)) return null;

      const response = await executeRetrievalPipeline(params, compiled, {
        onPreparing(value) {
          if (requestGeneration !== generation) return;
          activeIdentity.value = {
            runId: value.runId,
            configHash: value.result.configHash,
          };
          transition("preparing");
        },
        onRunning(value) {
          if (requestGeneration !== generation) return;
          activeIdentity.value = {
            runId: value.runId,
            configHash: value.result.configHash,
          };
          if (state.value === "ready") transition("preparing");
          transition("running");
        },
      });
      const responseIdentity = {
        runId: response.runId ?? compiled.runId,
        configHash: response.configHash,
      };
      if (
        requestGeneration !== generation ||
        !isCurrentRecallPipelineResponse(activeIdentity.value, responseIdentity)
      ) {
        return null;
      }

      const outcome =
        response.outcome ?? (response.results.length ? "success" : "empty");
      if (
        outcome !== "success" &&
        outcome !== "empty" &&
        outcome !== "fallback"
      ) {
        throw new Error(`unexpected Recall pipeline outcome: ${outcome}`);
      }
      const accepted: RetrievalPipelineRunSnapshot = {
        ...responseIdentity,
        outcome,
        results: response.results,
        requestedPresetId: response.requestedPresetId,
        actualPresetId: response.actualPresetId,
        trace: response.trace,
      };
      snapshot.value = accepted;
      transition(outcome);
      return accepted;
    } catch (cause) {
      if (requestGeneration !== generation) return null;
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      if (state.value === "compiling") transition("failed");
      else if (state.value === "ready") {
        transition("preparing");
        transition("failed");
      } else if (state.value === "preparing" || state.value === "running") {
        transition("failed");
      }
      return null;
    }
  }

  function cancel() {
    generation += 1;
    activeIdentity.value = null;
    if (state.value === "preparing" || state.value === "running") {
      transition("cancelled");
    } else if (state.value === "compiling") {
      transition("failed");
    }
  }

  function reset() {
    generation += 1;
    if (state.value === "compiling") transition("failed");
    else if (state.value === "preparing" || state.value === "running") {
      transition("cancelled");
    }
    if (state.value !== "idle") transition("idle");
    compilation.value = null;
    activeIdentity.value = null;
    snapshot.value = null;
    error.value = null;
  }

  return {
    state,
    loading,
    compilation,
    activeIdentity,
    snapshot,
    results,
    error,
    run,
    cancel,
    reset,
  };
}
