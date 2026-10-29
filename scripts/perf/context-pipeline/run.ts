// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { DevConnection } from "../../dev-control/connection";
import { getInstance } from "../../dev-control/discovery";
import { runContextProbe, type ContextProbeOptions } from "./page";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((arg) => arg !== "--"),
  strict: true,
  options: {
    instance: { type: "string" },
    case: { type: "string" },
    samples: { type: "string", default: "5" },
    model: { type: "string", default: "context-perf-heuristic" },
    "out-dir": {
      type: "string",
      default: `.tmp/context-pipeline/${Date.now()}`,
    },
  },
});
if (!values.instance) throw new Error("Specify an isolated --instance");
const samples = Number(values.samples);
if (!Number.isInteger(samples) || samples < 1 || samples > 30)
  throw new Error("--samples must be 1..30");
const instance = getInstance(values.instance);
if (instance.frontendMode !== "hmr")
  throw new Error("Use an isolated HMR instance");
const out = resolve(values["out-dir"]!);
await mkdir(out, { recursive: true });
const cases: ContextProbeOptions[] = [
  ...[100, 1000, 5000].map((count) => ({
    id: `text-${count}`,
    count,
    chars: 1024,
  })),
  { id: "send-1000", count: 1000, chars: 1024, mode: "send" as const },
  { id: "send-5000", count: 5000, chars: 1024, mode: "send" as const },
  { id: "budget-1000", count: 1000, chars: 1024, budget: 4096 },
  { id: "html-200", count: 200, chars: 4096, html: true },
  { id: "regex-1000", count: 1000, chars: 1024, regexRules: 20 },
  { id: "worldbook-2", count: 1000, chars: 1024, worldbookDepth: 2 },
  { id: "worldbook-200", count: 1000, chars: 1024, worldbookDepth: 200 },
  {
    id: "plain-1000",
    count: 1000,
    chars: 1024,
    variant: "uninstrumented" as const,
  },
  {
    id: "cache-1000",
    count: 1000,
    chars: 1024,
    variant: "request-cache" as const,
  },
  {
    id: "no-delta-1000",
    count: 1000,
    chars: 1024,
    variant: "no-formatter-delta" as const,
  },
  ...[1000, 4000, 16000, 32000].map((count) => ({
    id: `cpu-${count}`,
    count,
    chars: 64,
    cpuOnly: true,
  })),
].map((c) => ({ ...c, samples, model: values.model! }));
const selected = values.case
  ? cases.filter((c) => c.id === values.case)
  : cases;
if (!selected.length) throw new Error(`Unknown --case ${values.case}`);
const report = {
  createdAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  frontendMode: instance.frontendMode,
  samples,
  model: values.model,
  results: [] as Awaited<ReturnType<typeof runContextProbe>>[],
  comparisons: [] as Array<{
    baseline: string;
    variant: string;
    sameOutput: boolean;
  }>,
};
const median = (ns: number[]) =>
  [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)];
const connection = await DevConnection.attach(instance, 20000);
try {
  const page = await connection.window("main", 20000);
  await connection.verify(page, "main");
  // Drop prior HMR module generations so direct probe imports share the application scope.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      !!(window as unknown as { Vue?: unknown }).Vue &&
      window.__AIO_DEV_CONTROL__?.describe().ready === true
  );
  for (const c of selected) {
    console.log(`Running ${c.id} (${samples} warm samples)...`);
    const result = await page.evaluate(runContextProbe, c);
    report.results.push(result);
    const baseline = report.results.find(
      (r) => r.options.id === `text-${c.count}` && !r.options.variant
    );
    if (baseline && c.variant) {
      const sameOutput = result.rows.every(
        (r) =>
          JSON.stringify(r.output) === JSON.stringify(baseline.rows[0].output)
      );
      report.comparisons.push({
        baseline: baseline.options.id,
        variant: c.id,
        sameOutput,
      });
      if (!sameOutput) process.exitCode = 1;
    }
    // Preserve finished cases even if a later replay fails or is interrupted.
    await writeFile(
      resolve(out, "report.json"),
      JSON.stringify(report, null, 2)
    );
    const summary = {
      id: c.id,
      medianMs: median(result.rows.map((r) => r.wallMs)),
      maxTimerLagMs: Math.max(...result.rows.map((r) => r.maxTimerLagMs)),
      requests: Object.values(result.rows[0].stages).reduce(
        (n, s) => n + s.requests,
        0
      ),
      stagesMs: Object.fromEntries(
        Object.keys(result.rows[0].stages).map((key) => [
          key,
          median(result.rows.map((r) => r.stages[key]?.ms ?? 0)),
        ])
      ),
      output: result.rows[0].output,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (result.rows.some((r) => !r.valid)) process.exitCode = 1;
  }
} finally {
  await connection.close();
}
console.log(`Report: ${resolve(out, "report.json")}`);
