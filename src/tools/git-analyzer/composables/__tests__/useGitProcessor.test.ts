import { describe, expect, it } from "vitest";
import { formatDate, generateTimelineData } from "../useGitProcessor";
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
