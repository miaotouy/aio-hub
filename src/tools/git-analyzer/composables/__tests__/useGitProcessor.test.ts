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
  calculateEngineeringMetrics,
  formatDate,
  generateTimelineData,
} from "../useGitProcessor";
import type { GitCommit } from "../../types";

function createCommit(date: string): GitCommit {
  return {
    hash: date,
    author: "tester",
    email: "tester@example.com",
    date,
    message: "test",
  };
}

describe("git analyzer date formatting", () => {
  it("keeps ISO commit timestamps in their original offset", () => {
    const commitDate = "2026-06-08T08:59:00+08:00";

    expect(formatDate(commitDate, "iso")).toBe(commitDate);
  });
});

describe("git analyzer timeline data", () => {
  const commits = [
    createCommit("2025-12-29T09:00:00+08:00"),
    createCommit("2025-12-31T10:00:00+08:00"),
    createCommit("2026-01-01T11:00:00+08:00"),
    createCommit("2026-02-15T12:00:00+08:00"),
  ];

  it("groups commits by day by default", () => {
    expect(generateTimelineData(commits)).toEqual([
      { date: "2025-12-29", count: 1 },
      { date: "2025-12-31", count: 1 },
      { date: "2026-01-01", count: 1 },
      { date: "2026-02-15", count: 1 },
    ]);
  });

  it("groups commits by ISO week", () => {
    expect(generateTimelineData(commits, "week")).toEqual([
      { date: "2026-W01", count: 3 },
      { date: "2026-W07", count: 1 },
    ]);
  });

  it("groups commits by month", () => {
    expect(generateTimelineData(commits, "month")).toEqual([
      { date: "2025-12", count: 2 },
      { date: "2026-01", count: 1 },
      { date: "2026-02", count: 1 },
    ]);
  });

  it("groups commits by year", () => {
    expect(generateTimelineData(commits, "year")).toEqual([
      { date: "2025", count: 2 },
      { date: "2026", count: 2 },
    ]);
  });
});

describe("git analyzer engineering metrics", () => {
  it("aggregates churn, file hotspots, and commit sizes without treating missing stats as zero", () => {
    const commits: GitCommit[] = [
      {
        ...createCommit("2026-01-03T12:00:00Z"),
        stats: { additions: 20, deletions: 10, files: 2 },
        files: [
          {
            path: "src/core.ts",
            status: "modified",
            additions: 15,
            deletions: 5,
          },
          { path: "README.md", status: "modified", additions: 5, deletions: 5 },
        ],
      },
      {
        ...createCommit("2026-01-02T12:00:00Z"),
        stats: { additions: 100, deletions: 0, files: 1 },
        files: [
          {
            path: "src/core.ts",
            status: "modified",
            additions: 100,
            deletions: 0,
          },
        ],
      },
      createCommit("2026-01-01T12:00:00Z"),
    ];

    expect(calculateEngineeringMetrics(commits)).toEqual({
      totalCommits: 3,
      commitsWithStats: 2,
      commitsWithFiles: 2,
      commitsWithPartialFiles: 0,
      additions: 120,
      deletions: 10,
      hotFiles: [
        { path: "src/core.ts", changes: 2, additions: 115, deletions: 5 },
        { path: "README.md", changes: 1, additions: 5, deletions: 5 },
      ],
      commitSizes: [
        { label: "微型 · <30 行", count: 0 },
        { label: "小型 · 30-99 行", count: 1 },
        { label: "中型 · 100-299 行", count: 1 },
        { label: "大型 · 300-999 行", count: 0 },
        { label: "巨型 · 1000+ 行", count: 0 },
      ],
    });
  });

  it("places exact size boundaries in the expected bucket and caps hotspot rows", () => {
    const commits = [29, 30, 99, 100, 299, 300, 999, 1000].map(
      (size, index) => ({
        ...createCommit(
          `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00Z`
        ),
        stats: { additions: size, deletions: 0, files: 0 },
        files: [
          {
            path: `src/file-${index}.ts`,
            status: "modified",
            additions: size,
            deletions: 0,
          },
        ],
      })
    );

    const metrics = calculateEngineeringMetrics(commits, 3);

    expect(metrics.commitSizes.map(({ count }) => count)).toEqual([
      1, 2, 2, 2, 1,
    ]);
    expect(metrics.hotFiles).toHaveLength(3);
  });

  it("tracks incomplete remote file lists separately from complete file coverage", () => {
    const metrics = calculateEngineeringMetrics([
      {
        ...createCommit("2026-01-01T12:00:00Z"),
        files: [
          {
            path: "src/partial.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
          },
        ],
        filesComplete: false,
      },
    ]);

    expect(metrics.commitsWithFiles).toBe(0);
    expect(metrics.commitsWithPartialFiles).toBe(1);
    expect(metrics.hotFiles[0]?.path).toBe("src/partial.ts");
  });
});
