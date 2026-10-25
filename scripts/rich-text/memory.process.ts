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

import { plugin } from "bun";
import { heapStats, memoryUsage } from "bun:jsc";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { astValue, signature } from "./bench-shared";
import type { AstNode } from "../../src/tools/rich-text-renderer/types";
import type {
  MemorySample,
  MemoryCheckpoint,
  MemoryCycle,
  MemoryJob,
  MemoryMeasurement,
} from "./memory-shared";

const job = JSON.parse(await Bun.stdin.text()) as MemoryJob;
if (job.tokenizerTransport !== "worker")
  plugin({
    name: "rich-text-memory-direct-tokenizer",
    setup(build) {
      build.onLoad(
        { filter: /[\\/]parser[\\/]tokenizerService\.ts$/ },
        (args) => ({
          loader: "ts",
          contents:
            "import { Tokenizer } from " +
            JSON.stringify(join(dirname(args.path), "Tokenizer.ts")) +
            "; export const tokenizerService = { tokenize: async (text, options) => new Tokenizer(options).tokenize(text), terminate() {} };",
        })
      );
    },
  });
const source = join(job.root, "src/tools/rich-text-renderer");
const { CustomParser } = (await import(
  pathToFileURL(join(source, "core/CustomParser.ts")).href
)) as typeof import("../../src/tools/rich-text-renderer/core/CustomParser");
const { StreamProcessorV2 } = (await import(
  pathToFileURL(join(source, "core/StreamProcessorV2.ts")).href
)) as typeof import("../../src/tools/rich-text-renderer/core/StreamProcessorV2");
const { useMarkdownAst } = (await import(
  pathToFileURL(join(source, "composables/useMarkdownAst.ts")).href
)) as typeof import("../../src/tools/rich-text-renderer/composables/useMarkdownAst");
const { tokenizerService } = (await import(
  pathToFileURL(join(source, "parser/tokenizerService.ts")).href
)) as typeof import("../../src/tools/rich-text-renderer/parser/tokenizerService");
const frames = new Map<number, FrameRequestCallback>();
let frame = 0;
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frame, callback);
  return frame;
};
globalThis.cancelAnimationFrame = (id) => {
  frames.delete(id);
};
function flush() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(performance.now()));
  if (frames.size) throw new Error("Unexpected additional animation frame");
}
function sample(): MemorySample {
  const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
  return { rss, heapUsed, heapTotal, external };
}
async function checkpoint(): Promise<MemoryCheckpoint> {
  for (let i = 0; i < 2; i++) {
    await Bun.sleep(0);
    Bun.gc(true);
  }
  const point = sample();
  const stats = heapStats();
  return {
    ...point,
    jscHeapSize: stats.heapSize,
    jscExtraMemory: stats.extraMemorySize,
    objectCount: stats.objectCount,
  };
}
function compare(nodes: AstNode[]) {
  const actual = signature(astValue(nodes));
  const expected = signature(
    astValue(new CustomParser().parse(job.markdown), true)
  );
  return { outputSignature: actual, finalMatches: actual === expected };
}
async function cycle(text: string, verify: boolean) {
  const state = useMarkdownAst({
    throttleEnabled: false,
    safetyGuardEnabled: false,
  });
  const processor = new StreamProcessorV2({
    onPatch: (patches) => state.enqueuePatch(patches),
    safetyGuardEnabled: true,
    llmThinkTagNames: new Set(["think"]),
  });
  const peak = sample();
  const observe = () => {
    const point = sample();
    for (const key of ["rss", "heapUsed", "heapTotal", "external"] as const)
      peak[key] = Math.max(peak[key], point[key]);
  };
  try {
    let chunks = 0;
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + job.chunkSize, text.length);
      const before = text.charCodeAt(end - 1),
        after = text.charCodeAt(end);
      if (
        before >= 0xd800 &&
        before <= 0xdbff &&
        after >= 0xdc00 &&
        after <= 0xdfff
      )
        end++;
      await processor.process(text.slice(start, end));
      flush();
      observe();
      start = end;
      if (job.yieldEvery && ++chunks % job.yieldEvery === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    await processor.finalize();
    flush();
    observe();
    const completed = sample();
    const retained = await checkpoint();
    // Capture lifetime peaks before normalization/validation creates temporary trees.
    const native = memoryUsage();
    const verification = verify ? compare(state.ast.value) : undefined;
    return { peak, completed, retained, native, verification };
  } finally {
    processor.destroy();
    state.dispose();
    frames.clear();
  }
}
// A fixed tiny warmup avoids loading all corpus presets or retaining a full warmup AST.
await cycle("# Warmup\n\nHello **world**.", false);
const baseline = await checkpoint();
const startupPeakRss = memoryUsage().peak;
const cycles: MemoryCycle[] = [];
let processPeakRss = startupPeakRss,
  processPeakCommit = 0;
let verification: ReturnType<typeof compare> | undefined;
for (let i = 0; i < job.cycles; i++) {
  const current = await cycle(job.markdown, i === job.cycles - 1);
  processPeakRss = Math.max(processPeakRss, current.native.peak);
  processPeakCommit = Math.max(processPeakCommit, current.native.peakCommit);
  verification = current.verification || verification;
  const released = await checkpoint();
  cycles.push({
    peak: current.peak,
    completed: current.completed,
    retained: current.retained,
    released,
  });
}
if (!verification) throw new Error("No completed cycle verified");
const result: MemoryMeasurement = {
  pid: process.pid,
  baseline,
  startupPeakRss,
  processPeakRss,
  processPeakCommit,
  cycles,
  ...verification,
};
tokenizerService.terminate();
console.log(JSON.stringify(result));
