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
import { cpus, type, release } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createCorpus } from "./bench-corpus";
import { shuffled } from "./bench-shared";
import { archiveRenderer } from "./bench-source";
import {
  renderMemoryReport,
  type MemoryReport,
  type MemoryJob,
  type MemoryMeasurement,
} from "./memory-shared";

async function measure(
  job: MemoryJob,
  timeout: number
): Promise<MemoryMeasurement> {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "memory.process.ts")],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeout);
  try {
    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (timedOut) throw new Error("Memory process exceeded " + timeout + " ms");
    if (code !== 0) throw new Error(stderr || stdout || "Child exit " + code);
    return JSON.parse(stdout) as MemoryMeasurement;
  } finally {
    clearTimeout(timer);
  }
}
async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "baseline-refs": { type: "string", default: "bc25327ad" },
      "no-baseline": { type: "boolean" },
      "out-dir": { type: "string", default: ".tmp/rich-text-memory" },
      sizes: { type: "string", default: "100" },
      filter: {
        type: "string",
        default: "^(prose|code|references|loose-list):",
      },
      rounds: { type: "string", default: "3" },
      cycles: { type: "string", default: "3" },
      "chunk-size": { type: "string", default: "256" },
      "yield-every": { type: "string", default: "0" },
      tokenizer: { type: "string", default: "worker" },
      "timeout-ms": { type: "string", default: "120000" },
      seed: { type: "string", default: "20261025" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "bun run rich-text:memory [--baseline-refs REF,REF | --no-baseline] [--sizes 10,100]\n  [--filter REGEXP] [--rounds 3] [--cycles 3] [--chunk-size 256]\n  [--tokenizer inline|worker] [--yield-every 0|1|N] [--timeout-ms 120000] [--seed 20261025] [--out-dir .tmp/rich-text-memory]"
    );
    return;
  }
  const positive = (value: string) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1)
      throw new Error("Expected positive integer: " + value);
    return n;
  };
  const tokenizerTransport = values.tokenizer;
  if (tokenizerTransport !== "inline" && tokenizerTransport !== "worker")
    throw new Error("Expected --tokenizer inline|worker");
  const yieldEvery = Number(values["yield-every"]);
  if (!Number.isSafeInteger(yieldEvery) || yieldEvery < 0)
    throw new Error("Expected nonnegative --yield-every");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const rounds = positive(values.rounds),
    cycles = positive(values.cycles),
    chunkSize = positive(values["chunk-size"]),
    seed = positive(values.seed),
    timeout = positive(values["timeout-ms"]);
  const filter = new RegExp(values.filter);
  const corpus = createCorpus(values.sizes.split(",").map(positive)).filter(
    (input) => filter.test(input.id)
  );
  if (!corpus.length) throw new Error("No matching corpus inputs");
  const engines = [{ id: "current", revision: git("rev-parse", "HEAD"), root }];
  if (!values["no-baseline"])
    for (const ref of new Set(
      values["baseline-refs"].split(",").filter(Boolean)
    )) {
      const revision = git("rev-parse", "--verify", ref + "^{commit}");
      engines.push({
        id: ref,
        revision,
        root: await archiveRenderer(root, revision),
      });
    }
  const out = resolve(root, values["out-dir"]);
  await mkdir(out, { recursive: true });
  const report: MemoryReport = {
    metadata: {
      createdAt: new Date().toISOString(),
      runtime: "Bun " + Bun.version,
      platform: type() + " " + release(),
      cpu: cpus()[0]?.model || "unknown",
      sourceRevision: engines[0].revision,
      sourceChanges: git(
        "status",
        "--short",
        "--",
        "src/tools/rich-text-renderer",
        "scripts/rich-text",
        "package.json"
      ),
      rounds,
      cycles,
      chunkSize,
      yieldEvery,
      tokenizerTransport,
      seed,
      engines: engines.map(({ id, revision }) => ({ id, revision })),
    },
    corpus: corpus.map((input) => ({
      id: input.id,
      bytes: input.bytes,
      characters: input.markdown.length,
    })),
    results: [],
  };
  for (let round = 0; round < rounds; round++) {
    for (const input of shuffled(corpus, seed + round))
      for (const engine of shuffled(engines, seed + round + input.bytes)) {
        const base = { caseId: input.id, engine: engine.id, round };
        try {
          const measurement = await measure(
            {
              root: engine.root,
              markdown: input.markdown,
              chunkSize,
              cycles,
              yieldEvery,
              tokenizerTransport,
            },
            timeout
          );
          report.results.push({ ...base, status: "ok", measurement });
        } catch (error) {
          report.results.push({
            ...base,
            status: "error",
            error: String(error),
          });
        }
      }
    await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
    await writeFile(join(out, "report.md"), renderMemoryReport(report));
    console.log(
      "Round " +
        (round + 1) +
        "/" +
        rounds +
        ": " +
        report.results.length +
        " independent processes recorded"
    );
  }
  const failed = report.results.filter(
    (row) => row.status !== "ok" || !row.measurement?.finalMatches
  );
  const different = report.corpus.filter(
    (input) =>
      new Set(
        report.results
          .filter((row) => row.status === "ok" && row.caseId === input.id)
          .map((row) => row.measurement!.outputSignature)
      ).size > 1
  );
  console.log(
    "Report: " +
      join(out, "report.md") +
      "\nFailed or unequal: " +
      failed.length +
      "; cross-version differences: " +
      different.length
  );
  if (failed.length || different.length) process.exitCode = 1;
}
if (import.meta.main)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
