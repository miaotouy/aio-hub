import { describe, expect, it } from "vitest";
import { mergeSubtitleEntries, splitSubtitleEntry } from "../subtitleOps";
import type { SubtitleEntry } from "../../types";

const base: SubtitleEntry = {
  id: "a",
  text: "hello world",
  startMs: 1000,
  endMs: 5000,
  status: "done",
};

describe("splitSubtitleEntry", () => {
  it("splits an entry at an interior timestamp", () => {
    const parts = splitSubtitleEntry(base, 3000, "b");
    expect(parts).not.toBeNull();
    const [first, second] = parts!;
    expect(first).toMatchObject({ id: "a", startMs: 1000, endMs: 3000, text: "hello world" });
    expect(second).toMatchObject({ id: "b", startMs: 3000, endMs: 5000, text: "hello world" });
  });

  it("rounds the split timestamp", () => {
    const parts = splitSubtitleEntry(base, 2999.6, "b");
    expect(parts![0].endMs).toBe(3000);
    expect(parts![1].startMs).toBe(3000);
  });

  it("rejects timestamps outside the entry interior", () => {
    expect(splitSubtitleEntry(base, 1000, "b")).toBeNull();
    expect(splitSubtitleEntry(base, 5000, "b")).toBeNull();
    expect(splitSubtitleEntry(base, 500, "b")).toBeNull();
  });
});

describe("mergeSubtitleEntries", () => {
  it("merges entries into the earliest span and joins text", () => {
    const merged = mergeSubtitleEntries([
      { id: "b", text: "world", startMs: 3000, endMs: 5000, status: "done" },
      { id: "a", text: "hello", startMs: 1000, endMs: 3200, status: "done" },
    ]);
    expect(merged).toMatchObject({
      id: "a",
      text: "hello world",
      startMs: 1000,
      endMs: 5000,
      status: "done",
    });
  });

  it("drops empty text and propagates non-done status", () => {
    const merged = mergeSubtitleEntries([
      { id: "a", text: "hello", startMs: 0, endMs: 1000, status: "processing" },
      { id: "b", text: "  ", startMs: 1000, endMs: 2000, status: "done" },
    ]);
    expect(merged?.text).toBe("hello");
    expect(merged?.status).toBe("processing");
  });

  it("returns null when there is nothing to merge", () => {
    expect(mergeSubtitleEntries([])).toBeNull();
    expect(mergeSubtitleEntries([base])).toBeNull();
  });
});
