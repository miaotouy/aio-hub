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
import { isMainThread } from "node:worker_threads";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import MarkdownIt from "markdown-it";
import type { AstNode, Patch } from "../../src/tools/rich-text-renderer/types";
import {
  astValue,
  signature,
  type BenchJob,
  type StaticMeasurement,
  type StreamMeasurement,
} from "./bench-shared";
import { splitChunks } from "./bench-corpus";
import { normalizeAst, normalizeHtml, firstDifference } from "./semantics";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: { fragment(html: string): DocumentFragment };
};
type Parser =
  import("../../src/tools/rich-text-renderer/core/CustomParser").CustomParser;
type Processor =
  import("../../src/tools/rich-text-renderer/core/StreamProcessorV2").StreamProcessorV2;
type AstState = ReturnType<
  typeof import("../../src/tools/rich-text-renderer/composables/useMarkdownAst").useMarkdownAst
>;
let ParserClass: new () => Parser;
let StreamClass: new (options: {
  onPatch(patches: Patch[]): void;
  llmThinkTagNames: Set<string>;
  safetyGuardEnabled: boolean;
}) => Processor;
let createState: () => AstState;
let parser: Parser;
let initialized = false;
const markdown = {
  commonmark: new MarkdownIt("commonmark", { breaks: true, html: true }),
  tables: new MarkdownIt("commonmark", { breaks: true, html: true }).enable([
    "table",
    "strikethrough",
  ]),
};
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++nextFrame, callback);
  return nextFrame;
};
globalThis.cancelAnimationFrame = (id) => {
  frames.delete(id);
};
function flushFrames() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(performance.now()));
  if (frames.size)
    throw new Error(
      "Unexpected additional animation frame in computation benchmark"
    );
}

async function initialize(job: BenchJob) {
  if (initialized || job.engine.id === "markdown-it") return;
  plugin({
    name: "rich-text-bench-direct-tokenizer",
    setup(build) {
      build.onLoad(
        { filter: /[\\/]parser[\\/]tokenizerService\.ts$/ },
        (args) => ({
          loader: "ts",
          contents: `import { Tokenizer } from ${JSON.stringify(join(dirname(args.path), "Tokenizer.ts"))};
export const tokenizerService = { tokenize: async (text, options) => new Tokenizer(options).tokenize(text), terminate() {} };`,
        })
      );
    },
  });
  const source = join(job.engine.root!, "src/tools/rich-text-renderer");
  ({ CustomParser: ParserClass } = await import(
    pathToFileURL(join(source, "core/CustomParser.ts")).href
  ));
  ({ StreamProcessorV2: StreamClass } = await import(
    pathToFileURL(join(source, "core/StreamProcessorV2.ts")).href
  ));
  const { useMarkdownAst } = await import(
    pathToFileURL(join(source, "composables/useMarkdownAst.ts")).href
  );
  createState = () =>
    useMarkdownAst({ throttleEnabled: false, safetyGuardEnabled: false });
  parser = new ParserClass();
  initialized = true;
}

function countAst(nodes: AstNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + 1 + (node.children ? countAst(node.children) : 0),
    0
  );
}
function staticRun(job: BenchJob): StaticMeasurement {
  const md = markdown[job.corpus.profile];
  const external = job.engine.id === "markdown-it";
  let last: AstNode[] | ReturnType<MarkdownIt["parse"]> = [];
  const parse = external
    ? () => md.parse(job.corpus.markdown, {})
    : () => parser.parse(job.corpus.markdown);
  for (let i = 0; i < job.settings.warmup; i++) last = parse();
  const singleMs: number[] = [];
  for (let i = 0; i < job.settings.samples; i++) {
    const start = performance.now();
    last = parse();
    singleMs.push(performance.now() - start);
  }
  let iterations = 1;
  while (iterations < 1024) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) last = parse();
    if (performance.now() - start >= job.settings.batchMs) break;
    iterations *= 2;
  }
  const batchPerOpMs: number[] = [];
  for (let sample = 0; sample < job.settings.batches; sample++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) last = parse();
    batchPerOpMs.push((performance.now() - start) / iterations);
  }
  const result: StaticMeasurement = {
    singleMs,
    batchPerOpMs,
    batchIterations: iterations,
    outputSignature: signature(external ? last : astValue(last as AstNode[])),
    outputNodes: external
      ? (last as ReturnType<MarkdownIt["parse"]>).reduce(
          (n, token) => n + 1 + (token.children?.length ?? 0),
          0
        )
      : countAst(last as AstNode[]),
  };
  try {
    const semantic = external
      ? normalizeHtml(
          JSDOM.fragment(
            md.renderer.render(
              last as ReturnType<MarkdownIt["parse"]>,
              md.options,
              {}
            )
          )
        )
      : normalizeAst(last as AstNode[]);
    result.semanticSignature = signature(semantic);
  } catch (error) {
    result.semanticError = String(error);
  }
  return result;
}

async function streamRun(job: BenchJob): Promise<StreamMeasurement> {
  const chunks = splitChunks(job.corpus.markdown, job.chunkSize);
  const updateMs: number[] = [];
  const md = markdown[job.corpus.profile];
  if (job.engine.id === "markdown-it") {
    let prefix = "";
    let parsedCharacters = 0;
    let last = md.parse("", {});
    const start = performance.now();
    for (const chunk of chunks) {
      prefix += chunk;
      parsedCharacters += prefix.length;
      const tick = performance.now();
      last = md.parse(prefix, {});
      updateMs.push(performance.now() - tick);
    }
    const totalMs = performance.now() - start;
    return {
      totalMs,
      updateMs,
      finalizeMs: 0,
      patchApplyMs: 0,
      parseMs: updateMs.reduce((a, b) => a + b, 0),
      parsedCharacters,
      parseCalls: chunks.length,
      patchCount: 0,
      chunks: chunks.length,
      finalMatches:
        signature(last) === signature(md.parse(job.corpus.markdown, {})),
      outputSignature: signature(last),
    };
  }
  const state = createState();
  let patchCount = 0;
  let patchApplyMs = 0;
  let parsedCharacters = 0;
  let parseCalls = 0;
  let parseMs = 0;
  const original = ParserClass.prototype.parseAsync;
  ParserClass.prototype.parseAsync = async function (text: string) {
    parsedCharacters += text.length;
    parseCalls++;
    const start = performance.now();
    try {
      return await original.call(this, text);
    } finally {
      parseMs += performance.now() - start;
    }
  };
  const processor = new StreamClass({
    onPatch(patches) {
      patchCount += patches.length;
      state.enqueuePatch(patches);
    },
    llmThinkTagNames: new Set(["think"]),
    safetyGuardEnabled: true,
  });
  const flush = () => {
    const start = performance.now();
    flushFrames();
    patchApplyMs += performance.now() - start;
  };
  try {
    const start = performance.now();
    for (const chunk of chunks) {
      const tick = performance.now();
      await processor.process(chunk);
      flush();
      updateMs.push(performance.now() - tick);
    }
    const finalizeStart = performance.now();
    await processor.finalize();
    flush();
    const finalizeMs = performance.now() - finalizeStart;
    const totalMs = performance.now() - start;
    const actualValue = astValue(state.ast.value);
    const expectedValue = astValue(parser.parse(job.corpus.markdown), true);
    const actual = signature(actualValue);
    const expected = signature(expectedValue);
    return {
      totalMs,
      updateMs,
      finalizeMs,
      patchApplyMs,
      parseMs,
      parsedCharacters,
      parseCalls,
      patchCount,
      chunks: chunks.length,
      finalMatches: actual === expected,
      outputSignature: actual,
      ...(actual !== expected
        ? { finalDifference: firstDifference(expectedValue, actualValue) }
        : {}),
    };
  } finally {
    ParserClass.prototype.parseAsync = original;
    processor.destroy();
    state.dispose();
    frames.clear();
  }
}

// The profiling CLI runs the same workload on the profiled main thread.
export async function runBenchJob(job: BenchJob) {
  await initialize(job);
  if (job.mode === "static") return { static: staticRun(job) };
  if (job.round === 0) await streamRun(job);
  return { stream: await streamRun(job) };
}

if (!isMainThread) {
  const scope = globalThis as unknown as {
    onmessage(event: MessageEvent<BenchJob>): void;
    postMessage(value: unknown): void;
  };
  scope.onmessage = async (event) => {
    try {
      scope.postMessage(await runBenchJob(event.data));
    } catch (error) {
      scope.postMessage({
        error: error instanceof Error ? error.stack : String(error),
      });
    }
  };
  scope.postMessage({ ready: true });
}
