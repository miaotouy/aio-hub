// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it } from "vitest";
import {
  buildComparisonMarkdown,
  type RunResult,
  type VisualEquivalenceReview,
} from "./report";

function createRun(
  label: "baseline" | "candidate",
  commit: string,
  fps: number,
  artifact: string
): RunResult {
  return {
    label,
    lane: "release",
    commit,
    binary: `C:/perf/${label}.exe`,
    binarySha256: label,
    runIndex: 1,
    startedAt: "2026-09-19T00:00:00.000Z",
    finishedAt: "2026-09-19T00:00:12.000Z",
    host: {
      platform: "win32",
      release: "test",
      cpu: "test",
      memoryBytes: 1,
      gpus: ["test"],
    },
    fixture: {},
    visualArtifacts: [artifact],
    scenarios: [
      {
        scenarioId: "scroll-fast",
        description: "test",
        scroll: true,
        durationMs: 12_000,
        frames: {
          samples: 120,
          fps,
          p50: 16,
          p95: 20,
          p99: 25,
          max: 30,
          over16_7: 10,
          over33_3: 0,
          over50: 0,
          jankRatio: 0,
        },
        resources: {
          samples: 30,
          durationMs: 12_000,
          cpuSecondsTotal: 1,
          cpuSecondsPerSecond: 0.1,
          workingSetPeakBytes: 100,
          workingSetLastBytes: 90,
          privatePeakBytes: 80,
          gpu3dAvgPercent: 1,
          gpu3dPeakPercent: 2,
          gpuDedicatedPeakBytes: 70,
          gpuSharedPeakBytes: 60,
          processCount: 3,
          hasWebView2Process: true,
          hasGpuProcess: true,
        },
      },
    ],
  };
}

describe("glass material comparison visual gate", () => {
  const baseline = createRun(
    "baseline",
    "baseline-commit",
    60,
    "screenshots/baseline-top.png"
  );
  const candidate = createRun(
    "candidate",
    "candidate-commit",
    72,
    "screenshots/candidate-top.png"
  );

  it("does not call metric deltas improvements without a visual review", () => {
    const report = buildComparisonMarkdown([baseline, candidate]);

    expect(report).toContain("不构成优化成绩");
    expect(report).toContain("未判定（视觉门禁）");
    expect(report).not.toContain("| ✅ 改善 |");
  });

  it("allows verdicts only for a commit-bound review with both artifacts", () => {
    const review: VisualEquivalenceReview = {
      approved: true,
      baselineCommit: "baseline-commit",
      candidateCommit: "candidate-commit",
      reviewedAt: "2026-09-19T12:00:00.000Z",
      artifacts: [
        "screenshots/baseline-top.png",
        "screenshots/candidate-top.png",
      ],
    };

    const report = buildComparisonMarkdown([baseline, candidate], {
      visualReview: review,
    });

    expect(report).toContain("视觉等价评审：已通过");
    expect(report).toContain("| ✅ 改善 |");
    expect(report).not.toContain("未判定（视觉门禁）");
  });
});
