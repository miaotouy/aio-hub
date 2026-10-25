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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCorpus, splitChunks } from "./bench-corpus";
import { distribution, shuffled } from "./bench-shared";

// Protect the input and reporting contracts, independently of parser implementation.
describe("Markdown benchmark inputs and statistics", () => {
  it("replays every UTF-16 unit exactly once while keeping surrogate pairs intact", () => {
    const text = "a🌿中文😀\r\n**bold**\n";
    for (const size of [1, 2, 3, 16]) {
      const chunks = splitChunks(text, size);
      expect(chunks.join("")).toBe(text);
      expect(chunks.every((chunk) => chunk.length <= size + 1)).toBe(true);
      for (let i = 0; i < chunks.length - 1; i++) {
        const last = chunks[i].charCodeAt(chunks[i].length - 1);
        const first = chunks[i + 1].charCodeAt(0);
        expect(
          last >= 0xd800 && last <= 0xdbff && first >= 0xdc00 && first <= 0xdfff
        ).toBe(false);
      }
    }
    expect(splitChunks("", 4)).toEqual([]);
    expect(() => splitChunks(text, 0)).toThrow("positive integer");
  });

  it("builds reproducible size-scaled references with distinct labels and complete definitions", () => {
    const cases = createCorpus([1, 10]).filter((input) =>
      input.id.startsWith("references:")
    );
    expect(cases).toHaveLength(2);
    for (const input of cases) {
      const links = [
        ...input.markdown.matchAll(/\[label (\d+)\]\[ref-(\d+)\]/g),
      ];
      const definitions = [...input.markdown.matchAll(/^\[ref-(\d+)\]:/gm)];
      expect(links.map((match) => match[2])).toEqual(
        definitions.map((match) => match[1])
      );
      expect(new Set(definitions.map((match) => match[1])).size).toBe(
        definitions.length
      );
      expect(input.bytes).toBe(new TextEncoder().encode(input.markdown).length);
    }
    expect(cases[1].bytes / cases[0].bytes).toBeGreaterThan(9);
    expect(createCorpus([1, 10])).toEqual(createCorpus([1, 10]));
  });

  it("reports the sample median and nearest-rank P95 without mutating or trimming samples", () => {
    const samples = [1000, ...Array.from({ length: 19 }, (_, i) => i + 1)];
    expect(distribution(samples)).toEqual({
      count: 20,
      median: 10.5,
      p95: 19,
      min: 1,
      max: 1000,
    });
    expect(samples[0]).toBe(1000);
    expect(() => distribution([])).toThrow();
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffled(items, 42)).toEqual(shuffled(items, 42));
    expect(shuffled(items, 42).sort()).toEqual(items);
  });
});

it("executes real static and streaming engines and writes validated, separately scoped measurements", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const out = resolve(root, ".tmp/rich-text-bench/test-report");
  execFileSync(
    "bun",
    [
      "scripts/rich-text/run-bench.ts",
      "--no-baseline",
      "--filter",
      "^prose:1KiB$",
      "--sizes",
      "1",
      "--rounds",
      "1",
      "--samples",
      "3",
      "--batches",
      "1",
      "--warmup",
      "1",
      "--chunk-sizes",
      "256",
      "--out-dir",
      out,
    ],
    { cwd: root, timeout: 30000, stdio: "pipe" }
  );
  const report = JSON.parse(readFileSync(resolve(out, "report.json"), "utf8"));
  expect(report.results).toHaveLength(4);
  expect(
    report.results.every((row: { status: string }) => row.status === "ok")
  ).toBe(true);
  for (const engine of ["current", "markdown-it"]) {
    const row = report.results.find(
      (item: { engine: string; mode: string }) =>
        item.engine === engine && item.mode === "stream"
    );
    expect(row.stream.finalMatches).toBe(true);
    expect(row.stream.chunks).toBeGreaterThan(1);
    expect(row.stream.parsedCharacters).toBeGreaterThan(
      report.corpus[0].characters
    );
    expect(row.stream.totalMs).toBeGreaterThan(0);
  }
  const current = report.results.find(
    (row: { engine: string; mode: string }) =>
      row.engine === "current" && row.mode === "stream"
  );
  expect(current.stream.patchCount).toBeGreaterThan(0);
}, 35000);
