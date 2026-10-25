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

import { cpus, type, release } from "node:os";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createCorpus } from "./bench-corpus";
import {
  shuffled,
  type BenchJob,
  type BenchReport,
  type BenchResult,
  type Engine,
} from "./bench-shared";
import { renderBenchReport } from "./bench-report";

export class BenchWorker {
  private worker?: Worker;
  constructor(private readonly timeoutMs: number) {}
  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
  }
  private async start(): Promise<Worker> {
    const worker = new Worker(
      new URL("./bench.worker.ts", import.meta.url).href,
      { type: "module" }
    );
    await new Promise<void>((accept, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", ready);
        worker.removeEventListener("error", fail);
      };
      const timer = setTimeout(() => {
        cleanup();
        worker.terminate();
        reject(new Error("Benchmark worker startup timed out"));
      }, this.timeoutMs);
      const ready = (event: MessageEvent) => {
        cleanup();
        if (event.data.ready) accept();
        else {
          worker.terminate();
          reject(new Error("Unexpected startup response"));
        }
      };
      const fail = (event: ErrorEvent) => {
        cleanup();
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.addEventListener("message", ready);
      worker.addEventListener("error", fail);
    });
    this.worker = worker;
    return worker;
  }
  async run(job: BenchJob): Promise<BenchResult> {
    const base = {
      engine: job.engine.id,
      caseId: job.corpus.id,
      mode: job.mode,
      round: job.round,
      chunkSize: job.chunkSize,
    };
    try {
      const worker = this.worker ?? (await this.start());
      return await new Promise<BenchResult>((accept) => {
        const cleanup = () => {
          clearTimeout(timer);
          worker.removeEventListener("message", receive);
          worker.removeEventListener("error", fail);
        };
        const timer = setTimeout(() => {
          cleanup();
          this.dispose();
          accept({
            ...base,
            status: "timeout",
            error: `Job exceeded ${this.timeoutMs} ms`,
          });
        }, this.timeoutMs);
        const receive = (event: MessageEvent) => {
          cleanup();
          if (event.data.error) this.dispose();
          accept(
            event.data.error
              ? { ...base, status: "error", error: event.data.error }
              : { ...base, status: "ok", ...event.data }
          );
        };
        const fail = (event: ErrorEvent) => {
          cleanup();
          this.dispose();
          accept({ ...base, status: "error", error: event.message });
        };
        worker.addEventListener("message", receive);
        worker.addEventListener("error", fail);
        worker.postMessage(job);
      });
    } catch (error) {
      this.dispose();
      return { ...base, status: "error", error: String(error) };
    }
  }
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "baseline-ref": { type: "string", default: "f070c3f92" },
      "no-baseline": { type: "boolean" },
      "out-dir": { type: "string", default: ".tmp/rich-text-bench" },
      mode: { type: "string", default: "all" },
      sizes: { type: "string", default: "1,10,100" },
      filter: { type: "string" },
      rounds: { type: "string", default: "3" },
      samples: { type: "string", default: "20" },
      batches: { type: "string", default: "5" },
      "batch-ms": { type: "string", default: "3" },
      warmup: { type: "string", default: "5" },
      "chunk-sizes": { type: "string", default: "64,256" },
      "stream-all": { type: "boolean" },
      "timeout-ms": { type: "string", default: "30000" },
      seed: { type: "string", default: "20261025" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "bun run rich-text:bench [--mode all|static|stream] [--baseline-ref REF | --no-baseline]\n  [--filter REGEXP] [--sizes 1,10,100] [--chunk-sizes 64,256] [--stream-all]\n  [--rounds 3] [--samples 20] [--batches 5] [--batch-ms 3] [--warmup 5]\n  [--timeout-ms 30000] [--seed 20261025] [--out-dir .tmp/rich-text-bench]"
    );
    return;
  }
  const positive = (value: string, key: string) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1)
      throw new Error(key + " requires a positive integer");
    return n;
  };
  const list = (value: string, key: string) => [
    ...new Set(value.split(",").map((n) => positive(n, key))),
  ];
  if (!["all", "static", "stream"].includes(values.mode))
    throw new Error("Invalid --mode");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const out = resolve(root, values["out-dir"]);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const rounds = positive(values.rounds, "rounds"),
    seed = positive(values.seed, "seed");
  const settings = {
    samples: positive(values.samples, "samples"),
    batches: positive(values.batches, "batches"),
    batchMs: positive(values["batch-ms"], "batch-ms"),
    warmup: positive(values.warmup, "warmup"),
  };
  const chunkSizes = list(values["chunk-sizes"], "chunk-sizes");
  const filter = values.filter ? new RegExp(values.filter) : undefined;
  const corpus = createCorpus(list(values.sizes, "sizes")).filter(
    (input) => !filter || filter.test(input.id)
  );
  if (!corpus.length) throw new Error("No matching corpus inputs");
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "corpus.json"), JSON.stringify(corpus, null, 2));
  const engines: Engine[] = [{ id: "current", root }, { id: "markdown-it" }];
  let baselineRevision: string | undefined;
  if (!values["no-baseline"]) {
    baselineRevision = git(
      "rev-parse",
      "--verify",
      values["baseline-ref"] + "^{commit}"
    );
    const source = resolve(
      root,
      ".tmp/rich-text-bench/sources",
      baselineRevision
    );
    const marker = join(source, ".archive-ready");
    try {
      await access(marker);
    } catch {
      await mkdir(source, { recursive: true });
      const archive = join(source, "renderer.tar");
      execFileSync(
        "git",
        [
          "archive",
          "--format=tar",
          "--output=" + archive,
          baselineRevision,
          "src/tools/rich-text-renderer",
        ],
        { cwd: root }
      );
      execFileSync("tar", ["-xf", archive, "-C", source], { cwd: root });
      await writeFile(marker, baselineRevision);
    }
    engines.push({ id: "baseline", root: source });
  }
  const report: BenchReport = {
    metadata: {
      createdAt: new Date().toISOString(),
      runtime: "Bun " + Bun.version,
      os: type() + " " + release(),
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpus: cpus().length,
      sourceRevision: git("rev-parse", "HEAD"),
      sourceChanges: git(
        "status",
        "--short",
        "--",
        "src/tools/rich-text-renderer",
        "scripts/rich-text",
        "package.json",
        "bun.lock"
      ),
      baselineRevision,
      markdownItVersion: createRequire(import.meta.url)(
        "markdown-it/package.json"
      ).version,
      seed,
      rounds,
      settings,
      chunkSizes,
      mode: values.mode,
      execution:
        "Bun 隔离 Worker；分词服务替换为同版同步 Tokenizer；实际 AST、diff 与 patch 应用；连续计算模式",
    },
    corpus: corpus.map(({ markdown, ...input }) => ({
      ...input,
      characters: markdown.length,
    })),
    results: [],
  };
  const workers = new Map(
    engines.map((engine) => [
      engine.id,
      new BenchWorker(positive(values["timeout-ms"], "timeout-ms")),
    ])
  );
  const save = async () => {
    await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
    await writeFile(join(out, "report.md"), renderBenchReport(report));
  };
  try {
    for (let round = 0; round < rounds; round++) {
      let tasks = 0;
      for (const input of shuffled(corpus, seed + round)) {
        for (const mode of ["static", "stream"] as const) {
          if (values.mode !== "all" && values.mode !== mode) continue;
          if (mode === "stream" && !input.stream && !values["stream-all"])
            continue;
          for (const chunkSize of mode === "static" ? [0] : chunkSizes) {
            for (const engine of shuffled(engines, seed + round + tasks++)) {
              const result = await workers
                .get(engine.id)!
                .run({
                  engine,
                  corpus: input,
                  mode,
                  round,
                  settings,
                  chunkSize,
                });
              report.results.push(result);
              if (result.status !== "ok")
                console.error(
                  `${input.id}/${mode}/${engine.id}: ${result.status}: ${result.error}`
                );
            }
          }
        }
      }
      await save();
      console.log(
        `Round ${round + 1}/${rounds}: ${report.results.length} tasks recorded`
      );
    }
  } finally {
    workers.forEach((worker) => worker.dispose());
  }
  const failures = report.results.filter(
    (row) => row.status !== "ok" || row.stream?.finalMatches === false
  );
  console.log(
    `Report: ${join(out, "report.md")}\nFailed tasks or final-state differences: ${failures.length}`
  );
  if (failures.length) process.exitCode = 1;
}
if (import.meta.main)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
