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

import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { createCorpus } from "./bench-corpus";
import { runBenchJob } from "./bench.worker";
import type { BenchJob } from "./bench-shared";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    case: { type: "string", default: "references:100KiB" },
    mode: { type: "string", default: "stream" },
    "chunk-size": { type: "string", default: "256" },
    repeat: { type: "string", default: "3" },
  },
});
if (values.mode !== "static" && values.mode !== "stream")
  throw new Error("Expected --mode static|stream");
const size = /:(\d+)KiB$/.exec(values.case);
const corpus = createCorpus(size ? [Number(size[1])] : []).find(
  (input) => input.id === values.case
);
if (!corpus) throw new Error("Unknown corpus: " + values.case);
const chunkSize = Number(values["chunk-size"]);
const repeat = Number(values.repeat);
if (![chunkSize, repeat].every((value) => Number.isInteger(value) && value > 0))
  throw new Error("Expected positive --chunk-size and --repeat");
await mkdir(".tmp/rich-text-profile", { recursive: true });
for (let round = 0; round < repeat; round++) {
  const job: BenchJob = {
    engine: { id: "current", root: resolve(".") },
    corpus,
    mode: values.mode,
    chunkSize,
    round,
    settings: { warmup: 5, samples: 20, batches: 5, batchMs: 3 },
  };
  const measurement = await runBenchJob(job);
  console.log(JSON.stringify({ caseId: corpus.id, round, ...measurement }));
  if (measurement.stream && !measurement.stream.finalMatches)
    throw new Error("Streaming final AST differs from complete parse");
}
