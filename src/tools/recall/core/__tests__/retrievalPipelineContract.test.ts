// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { describe, expect, it } from "vitest";
import fixture from "../../__fixtures__/recall-pipeline-contract-v1.json";
import {
  RECALL_BUILTIN_PRESETS,
  RECALL_PIPELINE_ALGORITHM_VERSIONS,
  assertRecallPipelineContractFixture,
} from "../retrievalPipelineContract";
import {
  RECALL_PIPELINE_CONTRACT_VERSION,
  RECALL_PIPELINE_SCHEMA_VERSION,
  RECALL_PIPELINE_TRACE_VERSION,
  RECALL_PIPELINE_UI_TRANSITIONS,
  canTransitionRecallPipelineUiState,
  isCurrentRecallPipelineResponse,
} from "../../types/pipeline";

describe("Recall retrieval pipeline v1 contract", () => {
  it("keeps the shared wire fixture aligned with TypeScript constants", () => {
    assertRecallPipelineContractFixture(fixture);
    const { pipeline, compileResult, runResponse } = fixture;

    expect(fixture.contractVersion).toBe(RECALL_PIPELINE_CONTRACT_VERSION);
    expect(fixture.presetSummaries).toEqual(RECALL_BUILTIN_PRESETS);
    expect(pipeline.schemaVersion).toBe(RECALL_PIPELINE_SCHEMA_VERSION);
    expect(pipeline.algorithmVersion).toBe(
      RECALL_PIPELINE_ALGORITHM_VERSIONS.algorithmic
    );
    expect(compileResult.runId).toBe(runResponse.runId);
    expect(runResponse.trace?.traceVersion).toBe(RECALL_PIPELINE_TRACE_VERSION);
  });

  it("rejects malformed runtime contract data", () => {
    expect(() =>
      assertRecallPipelineContractFixture({
        ...fixture,
        compileResult: { ...fixture.compileResult, runId: 42 },
      })
    ).toThrow("fixture.compileResult.runId must be a string");
    expect(() =>
      assertRecallPipelineContractFixture({
        ...fixture,
        runResponse: {
          ...fixture.runResponse,
          trace: { ...fixture.runResponse.trace, finalLimit: undefined },
        },
      })
    ).toThrow("fixture.runResponse.trace.finalLimit must be a finite number");
  });

  it("separates candidate, expansion, and final result budgets", () => {
    expect(fixture.pipeline.candidateBudget).toBeGreaterThan(
      fixture.runResponse.trace.finalLimit
    );
    expect(fixture.pipeline.expansionBudget).toBe(0);
    expect(
      fixture.pipeline.nodes[fixture.pipeline.nodes.length - 1]?.params
    ).toEqual({ limit: 6 });
  });

  it("freezes weighted fusion and independent threshold score semantics", () => {
    const fusion = fixture.runResponse.trace.steps.find(
      (step) => step.moduleId === "weighted-fusion"
    );
    const priority = fixture.runResponse.trace.steps.find(
      (step) => step.moduleId === "priority-boost"
    );
    const threshold = fixture.runResponse.trace.steps.find(
      (step) => step.moduleId === "score-threshold"
    );

    expect(fusion?.details).toMatchObject({
      algorithm: "weighted-sum-v1",
      scoreField: "relevanceScore",
      rrf: false,
    });
    expect(priority?.details).toMatchObject({
      inputScoreField: "relevanceScore",
      outputScoreField: "score",
      applications: 1,
    });
    expect(threshold?.details).toMatchObject({
      scoreField: "relevanceScore",
      thresholdRange: [0, 1],
      priorityAffectsThreshold: false,
    });
  });

  it("rejects late responses when either run identity component changed", () => {
    const active = { runId: "run-2", configHash: "hash-b" };
    expect(isCurrentRecallPipelineResponse(active, active)).toBe(true);
    expect(
      isCurrentRecallPipelineResponse(active, {
        runId: "run-1",
        configHash: "hash-b",
      })
    ).toBe(false);
    expect(
      isCurrentRecallPipelineResponse(active, {
        runId: "run-2",
        configHash: "hash-a",
      })
    ).toBe(false);
    expect(isCurrentRecallPipelineResponse(null, active)).toBe(false);
  });

  it("freezes the UI state machine and restart behavior", () => {
    expect(fixture.uiTransitions).toEqual(
      Object.entries(RECALL_PIPELINE_UI_TRANSITIONS).map(([from, to]) => ({
        from,
        to,
      }))
    );
    expect(canTransitionRecallPipelineUiState("ready", "preparing")).toBe(true);
    expect(canTransitionRecallPipelineUiState("running", "compiling")).toBe(
      true
    );
    expect(canTransitionRecallPipelineUiState("blocked", "running")).toBe(
      false
    );
  });
});
