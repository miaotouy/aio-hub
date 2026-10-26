// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { resolve, basename } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { openTauriRendererSession } from "./tauri-renderer-session";
import { CustomParser } from "../../src/tools/rich-text-renderer/core/CustomParser";
import { createCorpus, splitChunks } from "./bench-corpus";
import { astValue, signature } from "./bench-shared";
import { installTauriMemoryPage } from "./tauri-memory-page";
import { takeHeapSnapshot } from "./tauri-memory-heap";
import { tokenizerHeaps } from "./tauri-memory-cdp";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((x) => x !== "--"),
  strict: true,
  options: {
    instance: { type: "string" },
    scroll: { type: "boolean", default: false },
    "input-file": { type: "string" },
    "heap-snapshots": { type: "boolean", default: false },
    "allow-hmr": { type: "boolean", default: false },
    cycles: { type: "string", default: "3" },
    size: { type: "string", default: "100" },
    "chunk-size": { type: "string", default: "256" },
    filter: { type: "string", default: "^(prose|code|references|loose-list):" },
    "out-dir": {
      type: "string",
      default: ".tmp/rich-text-memory/tauri-static",
    },
  },
});
const cycles = Number(values.cycles),
  size = Number(values.size),
  chunkSize = Number(values["chunk-size"]);
for (const n of [cycles, size, chunkSize])
  if (!Number.isInteger(n) || n < 1)
    throw new Error("Expected positive integer options");
const cases = values["input-file"]
  ? [
      {
        id: "file:" + basename(values["input-file"]),
        group: "generated" as const,
        profile: "commonmark" as const,
        markdown: await readFile(resolve(values["input-file"]), "utf8"),
        bytes: await Bun.file(values["input-file"]).size,
        stream: true,
      },
    ]
  : createCorpus([size]).filter(
      (x) => x.group === "generated" && new RegExp(values.filter!).test(x.id)
    );
if (!cases.length) throw new Error("No matching cases");
const outDir = resolve(values["out-dir"]!);
await mkdir(outDir, { recursive: true });
const { instance, connection, page, snapshot, componentUrl } =
  await openTauriRendererSession(values.instance, values["allow-hmr"]);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const browserCdp = await page.context().browser()!.newBrowserCDPSession();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

interface ProcessSample {
  at: number;
  processes: {
    pid: number;
    name: string;
    workingSet: number;
    privateBytes: number;
  }[];
}
const osSamples: ProcessSample[] = [];
// Windows samples only the verified native app and its descendants. Browser,
// GPU and utility processes are included; Vite and other app profiles stay out.
const samplerSource = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = ${instance.appPid}
$ids = @($root)
$i = 0
while ($true) {
  if ($i % 12 -eq 0) {
    $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
    $ids = @($root)
    do {
      $before = $ids.Count
      $ids = @($ids + @($all | Where-Object { $ids -contains [int]$_.ParentProcessId } | ForEach-Object { [int]$_.ProcessId }) | Select-Object -Unique)
    } while ($ids.Count -gt $before)
  }
  $rows = @(foreach ($id in $ids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) { @{pid=$id;name=$p.ProcessName;workingSet=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64} }
  })
  if (!$rows.Count) { break }
  @{at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();processes=$rows} | ConvertTo-Json -Compress -Depth 4
  $i++
  Start-Sleep -Milliseconds 250
}`;
if (!instance.appPid) throw new Error("Verified native app PID is unavailable");
const sampler = Bun.spawn(
  [
    "powershell.exe",
    "-NoProfile",
    "-EncodedCommand",
    Buffer.from(samplerSource, "utf16le").toString("base64"),
  ],
  { stdout: "pipe", stderr: "pipe" }
);
const sampling = (async () => {
  let pending = "";
  const reader = sampler.stdout.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    pending += new TextDecoder().decode(chunk);
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line) osSamples.push(JSON.parse(line));
    }
  }
})();
async function collect() {
  await cdp.send("HeapProfiler.collectGarbage");
  await Bun.sleep(100);
  await cdp.send("HeapProfiler.collectGarbage");
}
async function point(gc = false) {
  if (gc) await collect();
  const workerHeaps = await tokenizerHeaps(browserCdp, gc);
  const metrics = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((x) => [
      x.name,
      x.value,
    ])
  );
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  return {
    at: Date.now(),
    gc,
    workerHeaps,
    heap,
    dom,
    metrics,
    os: osSamples.at(-1),
    osSampleAgeMs: osSamples.length
      ? Date.now() - osSamples.at(-1)!.at
      : undefined,
    workers: page.workers().map((x) => x.url()),
  };
}
async function waitMatch(text: string) {
  const expected = signature(
    astValue(
      new CustomParser().parse(text.endsWith("\n") ? text : text + "\n"),
      true
    )
  );
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const actual = await page.evaluate(() =>
      window.__RICH_TEXT_MEMORY__!.signature()
    );
    if (actual === expected) return actual;
    await Bun.sleep(150);
  }
  throw new Error(
    "Final renderer AST differs from full parse or has not settled within 30 s"
  );
}
const snapshots: { label: string; path: string; bytes: number }[] = [];
async function snapshotHeap(label: string) {
  if (!values["heap-snapshots"]) return;
  const path = resolve(outDir, label + ".heapsnapshot");
  const bytes = await takeHeapSnapshot(cdp, path);
  snapshots.push({ label, path, bytes });
  console.log(JSON.stringify({ snapshot: label, bytes }));
}
const results: unknown[] = [];
const report: Record<string, unknown> = {
  createdAt: new Date().toISOString(),
  revision: (await Bun.$`git rev-parse HEAD`.text()).trim(),
  worktreeDirty: !!(await Bun.$`git status --porcelain`.text()).trim(),
  instance: { ...instance, dataDir: undefined },
  runtime: await cdp.send("Browser.getVersion"),
  snapshot,
  componentUrl,
  settings: {
    scroll: values.scroll,
    inputFile: values["input-file"] ? resolve(values["input-file"]) : undefined,
    heapSnapshots: values["heap-snapshots"],
    cycles,
    size,
    chunkSize,
    intervalMs: 250,
    smoothing: false,
    devtoolsEvents: "suppressed during probe, restored on cleanup",
    astThrottle: "production default",
    gc: "main and tokenizer Worker V8 isolates",
    codeExpanded: true,
  },
  cases: cases.map(({ markdown, ...rest }) => ({
    ...rest,
    characters: markdown.length,
  })),
  results,
  snapshots,
  errors,
};
try {
  report.probe = await page.evaluate(installTauriMemoryPage, componentUrl);
  await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.mount("props"));
  let small = "## Memory lifecycle\n\nA **bold** line.\nNext line\n";
  await page.evaluate((text) => window.__RICH_TEXT_MEMORY__!.push(text), small);
  await waitMatch(small);
  report.progressVerified = true;
  await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.finish());
  await waitMatch(small);
  const resumed = "\n\nResumed **after finalize**.\n";
  await page.evaluate(
    (text) => window.__RICH_TEXT_MEMORY__!.resume(text),
    resumed
  );
  small += resumed;
  await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.finish());
  await waitMatch(small);
  report.resumeVerified = true;
  await page.screenshot({ path: resolve(outDir, "resume.png") });
  await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.dispose());
  await Bun.sleep(1000);
  await page.evaluate(
    (text) => window.__RICH_TEXT_MEMORY__!.mount("static", text),
    small
  );
  await waitMatch(small);
  report.staticVerified = true;
  await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.dispose());
  const sampleDeadline = Date.now() + 15000;
  while (!osSamples.length && Date.now() < sampleDeadline) await Bun.sleep(100);
  if (!osSamples.length)
    throw new Error("Native process sampling did not start");
  report.baseline = await point(true);
  for (const item of cases) {
    // One small source-mode warmup per case initializes tokenizer/highlighter paths.
    await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.mount("source"));
    const warm = item.markdown.slice(0, Math.min(1024, item.markdown.length));
    await page.evaluate(
      (text) => window.__RICH_TEXT_MEMORY__!.push(text),
      warm
    );
    await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.finish());
    await waitMatch(warm);
    await Bun.sleep(1000);
    await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.dispose());
    const baseline = await point(true);
    await snapshotHeap(item.id.replace(/:/g, "-") + "-baseline");
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const startedAt = Date.now();
      await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.mount("source"));
      for (const chunk of splitChunks(item.markdown, chunkSize))
        await page.evaluate(
          (text) => window.__RICH_TEXT_MEMORY__!.push(text),
          chunk
        );
      await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.finish());
      const outputSignature = await waitMatch(item.markdown);
      await Bun.sleep(1000);
      const completed = await point();
      const held = await point(true);
      const dom = await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.dom());
      if (!dom.elements) throw new Error("Renderer produced no DOM");
      if (cycle === 1)
        await page.screenshot({
          path: resolve(outDir, item.id.replace(/:/g, "-") + ".png"),
        });
      let scroll;
      if (values.scroll) {
        const checkpoints = [];
        let milestone = 0.25;
        let steps = 0;
        const scrollStartedAt = Date.now();
        const scrollDeadline = scrollStartedAt + 180000;
        while (true) {
          const position = await page.evaluate(() =>
            window.__RICH_TEXT_MEMORY__!.scrollStep()
          );
          steps++;
          if (position.top >= position.max * milestone && milestone < 1) {
            checkpoints.push({
              fraction: milestone,
              position,
              measurement: await point(),
              dom: await page.evaluate(() =>
                window.__RICH_TEXT_MEMORY__!.dom()
              ),
            });
            console.log(
              JSON.stringify({
                caseId: item.id,
                cycle,
                scrollFraction: milestone,
                position,
                elapsedMs: Date.now() - scrollStartedAt,
              })
            );
            milestone += 0.25;
          }
          if (position.atEnd) break;
          if (Date.now() > scrollDeadline || steps > 10000) {
            report.scrollFailure = {
              caseId: item.id,
              cycle,
              steps,
              position,
              checkpoints,
              dom: await page.evaluate(() =>
                window.__RICH_TEXT_MEMORY__!.dom()
              ),
              elapsedMs: Date.now() - scrollStartedAt,
            };
            throw new Error("Document scroll exceeded its diagnostic limit");
          }
        }
        const inner = await page.evaluate(() =>
          window.__RICH_TEXT_MEMORY__!.scrollEditors()
        );
        await Bun.sleep(500);
        const bottom = await point(true);
        const bottomDom = await page.evaluate(() =>
          window.__RICH_TEXT_MEMORY__!.dom()
        );
        if (bottomDom.editors !== bottomDom.viewers)
          throw new Error(
            "Full scroll did not initialize every code viewer: " +
              JSON.stringify(bottomDom)
          );
        await waitMatch(item.markdown);
        if (cycle === 1)
          await page.screenshot({
            path: resolve(outDir, item.id.replace(/:/g, "-") + "-scrolled.png"),
          });
        await page.evaluate(() =>
          window.__RICH_TEXT_MEMORY__!.scrollStep(true)
        );
        await Bun.sleep(500);
        const returned = await point(true);
        const returnedDom = await page.evaluate(() =>
          window.__RICH_TEXT_MEMORY__!.dom()
        );
        scroll = {
          steps,
          checkpoints,
          inner,
          bottom,
          bottomDom,
          returned,
          returnedDom,
        };
        console.log(
          JSON.stringify({
            caseId: item.id,
            cycle,
            scrollSteps: steps,
            topEditors: dom.editors,
            bottomEditors: bottomDom.editors,
            bottomMiB: bottom.heap.usedSize / 1048576,
          })
        );
      }
      await page.evaluate(() => window.__RICH_TEXT_MEMORY__!.dispose());
      await Bun.sleep(1000);
      const idle = await point();
      const released = await point(true);
      const weak = await page.evaluate(() =>
        window.__RICH_TEXT_MEMORY__!.released()
      );
      await snapshotHeap(item.id.replace(/:/g, "-") + "-released-" + cycle);
      const row = {
        caseId: item.id,
        cycle,
        startedAt,
        baseline,
        completed,
        held,
        dom,
        outputSignature,
        scroll,
        idle,
        released,
        weak,
      };
      results.push(row);
      if (weak.componentAlive || weak.elementAlive || weak.subscriptions)
        throw new Error(
          `Renderer remains retained after GC: ${JSON.stringify(weak)}`
        );
      if (held.workerHeaps.length !== 1)
        throw new Error("Expected one shared tokenizer Worker");
      console.log(
        JSON.stringify({
          caseId: item.id,
          cycle,
          heldMiB: held.heap.usedSize / 1048576,
          releasedMiB: released.heap.usedSize / 1048576,
          dom: released.dom,
          weak,
        })
      );
      await Bun.write(
        resolve(outDir, "report.json"),
        JSON.stringify(report, null, 2) + "\n"
      );
    }
  }
  report.final = await point(true);
  report.status = errors.length ? "runtime-errors" : "ok";
} catch (error) {
  report.status = "error";
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  await page
    .evaluate(() => window.__RICH_TEXT_MEMORY__?.cleanup())
    .catch(() => {});
  sampler.kill();
  await sampling;
  report.samplerError = await new Response(sampler.stderr).text();
  await Bun.write(
    resolve(outDir, "process-samples.json"),
    JSON.stringify(osSamples) + "\n"
  );
  await Bun.write(
    resolve(outDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  await browserCdp.detach();
  await cdp.detach();
  await connection.close();
}
if (errors.length) process.exitCode = 1;
console.log(
  JSON.stringify({
    status: report.status,
    failure: report.failure,
    results: results.length,
    errors,
    outDir,
  })
);
