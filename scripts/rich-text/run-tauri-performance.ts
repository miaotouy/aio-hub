// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { CustomParser } from "../../src/tools/rich-text-renderer/core/CustomParser";
import { createCorpus, splitChunks } from "./bench-corpus";
import { astValue, signature } from "./bench-shared";
import { openTauriPerformanceSession } from "./tauri-performance-session";
import { installTauriMemoryPage } from "./tauri-memory-page";
import { runTauriPerformancePage } from "./tauri-performance-page";
import {
  summarizeTauriPerformance,
  renderTauriPerformanceReport,
  type TauriPerformanceRow,
} from "./tauri-performance-report";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((x) => x !== "--"),
  strict: true,
  options: {
    instance: { type: "string" },
    cycles: { type: "string", default: "3" },
    sizes: { type: "string", default: "10,100" },
    "chunk-size": { type: "string", default: "256" },
    "interval-ms": { type: "string", default: "20" },
    filter: { type: "string", default: "^(prose|code|references|loose-list):" },
    modes: { type: "string", default: "static,stream" },
    "out-dir": {
      type: "string",
      default: ".tmp/rich-text-performance/tauri-static",
    },
  },
});
const cycles = Number(values.cycles),
  chunkSize = Number(values["chunk-size"]),
  intervalMs = Number(values["interval-ms"]);
const sizes = values.sizes!.split(",").map(Number);
for (const n of [cycles, chunkSize, intervalMs, ...sizes])
  if (!Number.isInteger(n) || n < 1)
    throw new Error("Expected positive integer options");
const modes = values.modes!.split(",") as ("static" | "stream")[];
if (!modes.length || modes.some((mode) => !["static", "stream"].includes(mode)))
  throw new Error("Expected modes static,stream");
const cases = createCorpus(sizes).filter((x) =>
  new RegExp(values.filter!).test(x.id)
);
if (!cases.length) throw new Error("No matching corpus cases");
const outDir = resolve(values["out-dir"]!);
await mkdir(outDir, { recursive: true });
const session = await openTauriPerformanceSession(values.instance);
const errors = session.errors;
const rows: TauriPerformanceRow[] = [];
const report: Record<string, unknown> = {
  createdAt: new Date().toISOString(),
  sourceRevision: (await Bun.$`git rev-parse HEAD`.text()).trim(),
  worktreeDirty: !!(await Bun.$`git status --porcelain`.text()).trim(),
  runtime: session.runtime,
  machine: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    os: platform() + " " + release(),
  },
  instance: {
    instanceId: session.instance.instanceId,
    appPid: session.instance.appPid,
    frontendMode: session.instance.frontendMode,
  },
  snapshot: session.snapshot,
  componentUrl: session.componentUrl,
  settings: {
    cycles,
    sizes,
    chunkSize,
    intervalMs,
    modes,
    smoothing: false,
    enterAnimation: false,
    codeExpanded: true,
    astThrottle: "production default",
    componentActivity: "probe-local Vue mixin",
    view: "top viewport, no scrolling",
    warmupCharacters: 1024,
  },
  corpus: cases.map(({ markdown, ...item }) => ({
    ...item,
    characters: markdown.length,
  })),
  errors,
  results: rows,
  status: "running",
};
async function save() {
  await Bun.write(
    resolve(outDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  await Bun.write(
    resolve(outDir, "summary.md"),
    renderTauriPerformanceReport(rows)
  );
}
async function metrics() {
  return session.metrics();
}
let referenceParser = new CustomParser();
const expected = (markdown: string) =>
  signature(
    astValue(
      referenceParser.parse(
        markdown.endsWith("\n") ? markdown : markdown + "\n"
      ),
      true
    )
  );
try {
  const probe = await session.evaluate(installTauriMemoryPage, {
    componentUrl: session.componentUrl,
    measureActivity: true,
  });
  report.probe = probe;
  referenceParser = new CustomParser(
    new Set(probe.parserOptions.llmThinkRules.map((rule) => rule.tagName)),
    probe.parserOptions.llmThinkRules,
    probe.parserOptions.defaultToolCallCollapsed,
    probe.parserOptions.vcpFuzzyModeEnabled
  );
  for (const item of cases) {
    const expectedSignature = expected(item.markdown);
    const chunks = splitChunks(item.markdown, chunkSize);
    // The small warmup initializes the real tokenizer/highlighter path outside measured cycles.
    const warm = splitChunks(item.markdown, 1024)[0];
    await session.evaluate(runTauriPerformancePage, {
      mode: "static" as const,
      markdown: warm,
      chunks: [],
      intervalMs,
      expectedSignature: expected(warm),
      allowMissingLongTasks: session.allowMissingLongTasks,
    });
    await session.evaluate(() => window.__RICH_TEXT_MEMORY__!.dispose());
    await Bun.sleep(300);
    for (let cycle = 1; cycle <= cycles; cycle++) {
      for (const mode of modes) {
        await session.verify();
        const before = await metrics();
        const sample = await session.evaluate(runTauriPerformancePage, {
          mode,
          markdown: item.markdown,
          chunks,
          intervalMs,
          expectedSignature,
          allowMissingLongTasks: session.allowMissingLongTasks,
        });
        const after = await metrics();
        // DOM/editor counts are captured before disposal. Lifecycle cleanup is saved separately.
        await session.screenshot({
          path: resolve(
            outDir,
            item.id.replace(/[^\w-]/g, "-") + "-" + mode + "-" + cycle + ".png"
          ),
        });
        await session.evaluate(() => window.__RICH_TEXT_MEMORY__!.dispose());
        const afterDispose = await session.evaluate(
          () => window.__RICH_TEXT_MEMORY__!.activity().components
        );
        rows.push({
          caseId: item.id,
          cycle,
          sample,
          summary: summarizeTauriPerformance(sample),
          afterDispose,
          cdpMetrics: Object.fromEntries(
            Object.keys(after)
              .filter(
                (key) => key.endsWith("Duration") || key.endsWith("Count")
              )
              .map((key) => [key, after[key] - (before[key] ?? 0)])
          ),
        });
        await save();
        console.log(
          JSON.stringify({
            caseId: item.id,
            cycle,
            mode,
            summary: rows.at(-1)!.summary,
            editors: sample.dom.editors,
          })
        );
        await Bun.sleep(500);
      }
    }
  }
  report.status = errors.length ? "runtime-errors" : "ok";
  if (errors.length) process.exitCode = 1;
} catch (error) {
  report.status = "error";
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  await session
    .evaluate(() => window.__RICH_TEXT_MEMORY__?.cleanup())
    .catch(() => {});
  await session.close();
  if (errors.length) {
    report.status = "runtime-errors";
    process.exitCode = 1;
  }
  await save();
}
console.log(
  JSON.stringify({
    status: report.status,
    failure: report.failure,
    results: rows.length,
    outDir,
    errors,
  })
);
