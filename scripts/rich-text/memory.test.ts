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
import { expect, it } from "vitest";
import type { MemoryReport } from "./memory-shared";

// Protect process isolation, lifecycle checkpoints and equivalent output through
// the real CLI. Assertions stay stable when collector internals or usage change.
it.each(["inline", "worker"])(
  "measures independent %s lifecycles with GC checkpoints and matching output",
  (transport) => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const out = resolve(root, ".tmp/rich-text-memory/test-report-" + transport);
    execFileSync(
      "bun",
      [
        "scripts/rich-text/run-memory.ts",
        "--tokenizer",
        transport,
        "--baseline-refs",
        "HEAD",
        "--sizes",
        "1",
        "--filter",
        "^prose:1KiB$",
        "--rounds",
        "1",
        "--cycles",
        "2",
        "--out-dir",
        out,
      ],
      { cwd: root, timeout: 30000, stdio: "pipe" }
    );
    const report = JSON.parse(
      readFileSync(resolve(out, "report.json"), "utf8")
    ) as MemoryReport;
    expect(report.metadata.cycles).toBe(2);
    expect(report.results.map((r) => r.engine).sort()).toEqual([
      "HEAD",
      "current",
    ]);
    const signatures = new Set<string>();
    expect(
      new Set(report.results.map((row) => row.measurement?.pid)).size
    ).toBe(2);
    for (const row of report.results) {
      expect(row.status, row.error).toBe("ok");
      const data = row.measurement!;
      expect(data.finalMatches).toBe(true);
      signatures.add(data.outputSignature);
      expect(data.processPeakRss).toBeGreaterThanOrEqual(data.startupPeakRss);
      expect(data.baseline.jscHeapSize).toBeGreaterThan(0);
      expect(data.cycles).toHaveLength(2);
      for (const cycle of data.cycles) {
        for (const point of [
          cycle.peak,
          cycle.completed,
          cycle.retained,
          cycle.released,
        ]) {
          for (const value of Object.values(point))
            expect(Number.isFinite(value) && value >= 0).toBe(true);
          expect(point.rss).toBeGreaterThan(0);
        }
        expect(cycle.retained.objectCount).toBeGreaterThan(0);
        expect(cycle.released.objectCount).toBeGreaterThan(0);
      }
    }
    expect(signatures.size).toBe(1);
  },
  35000
);
