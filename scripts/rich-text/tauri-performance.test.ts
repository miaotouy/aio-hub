// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { summarizeTauriPerformance } from "./tauri-performance-report";
import type { TauriPerformanceSample } from "./tauri-performance-page";

function sample(): TauriPerformanceSample {
  return {
    mode: "stream",
    startAt: 0,
    mountedAt: 10,
    sendStartAt: 20,
    finishRequestedAt: 90,
    finalContentFrameAt: 120,
    verifiedAt: 100,
    validationMs: 40,
    deliveries: [
      { scheduledAt: 20, deliveredAt: 20, characters: 10 },
      { scheduledAt: 40, deliveredAt: 45, characters: 10 },
      { scheduledAt: 60, deliveredAt: 60, characters: 10 },
    ],
    commits: [
      { committedAt: 30, frameAt: 50 },
      { committedAt: 80, frameAt: 100 },
      { committedAt: 100, frameAt: 120 },
    ],
    commitFrames: [50, 100, 120],
    frames: [10, 25, 50, 70, 100, 120, 170],
    longTasks: [
      { startTime: 5, duration: 60 },
      { startTime: 100, duration: 60 },
      { startTime: 160, duration: 80 },
    ],
    components: {},
    finalMatches: true,
    dom: {
      elements: 1,
      text: "example",
      links: 0,
      codeBlocks: 0,
      editors: 0,
      viewers: 0,
      headers: 0,
      headerElements: 0,
      fallbackElements: 0,
      hiddenFallbacks: 0,
      editorElements: 0,
      codeBlockElements: 0,
      buttons: 0,
      scrollHeight: 1,
    },
  };
}

// Protect published timing boundaries, independent of parser/component internals.
// In particular a queued frame from an old commit must not acknowledge a new chunk.
describe("Tauri performance timing contract", () => {
  it("correlates deliveries with subsequent commits, including coalesced chunks", () => {
    const result = summarizeTauriPerformance(sample());
    expect(result.firstContentFrameMs).toBe(30);
    expect(result.nextCommitFrameWaitMs).toMatchObject({
      count: 3,
      median: 40,
      max: 55,
    });
    expect(result.deliveryLatenessMs).toMatchObject({ count: 3, max: 5 });
    expect(result.deliveriesWithSubsequentCommit).toBe(3);
  });

  it("separates final painting from validation and clips task attribution to the measured window", () => {
    const result = summarizeTauriPerformance(sample());
    expect(result.completionMs).toBe(30);
    expect(result.validationMs).toBe(40);
    expect(result.postValidationFrameMs).toBe(20);
    expect(result.longTaskCount).toBe(2);
    expect(result.longTaskTotalMs).toBe(65);
    expect(result.frameGapMs).toMatchObject({ count: 4, max: 30 });
  });

  it("uses mount origin for static first content and preserves an empty update distribution", () => {
    const input = sample();
    input.mode = "static";
    input.deliveries = [];
    const result = summarizeTauriPerformance(input);
    expect(result.firstContentFrameMs).toBe(50);
    expect(result.nextCommitFrameWaitMs).toBeNull();
    expect(result.totalMs).toBe(120);
    expect(result.completionMs).toBeNull();
  });
});
