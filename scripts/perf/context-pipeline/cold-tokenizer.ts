// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
/** Bounded cold-load diagnostic using a tiny real tokenizer, no model asset downloads. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TokenCalculatorEngine } from "../../../src/tools/token-calculator/core/tokenCalculatorEngine";

const out = resolve(".tmp/context-pipeline/cold-tokenizer");
await mkdir(out, { recursive: true });
const files = {
  tokenizerJSON: JSON.stringify({
    version: "1.0",
    truncation: null,
    padding: null,
    added_tokens: [
      {
        id: 0,
        content: "[UNK]",
        single_word: false,
        lstrip: false,
        rstrip: false,
        normalized: false,
        special: true,
      },
    ],
    normalizer: null,
    pre_tokenizer: { type: "Whitespace" },
    post_processor: null,
    decoder: null,
    model: {
      type: "WordLevel",
      vocab: { "[UNK]": 0, hello: 1 },
      unk_token: "[UNK]",
    },
  }),
  tokenizerConfigJSON: JSON.stringify({
    tokenizer_class: "PreTrainedTokenizer",
    unk_token: "[UNK]",
    clean_up_tokenization_spaces: false,
  }),
};
const rows = [];
for (const concurrency of [1, 8, 64]) {
  const engine = new TokenCalculatorEngine();
  engine.setRegistry({
    profiles: [
      {
        id: "synthetic",
        name: "Synthetic WordLevel",
        version: "1",
        description: "Cold-load diagnostic",
        modelPatterns: [],
        source: { type: "bundled", packageName: "synthetic" },
        confidence: "exact",
        enabled: true,
      },
    ],
    rules: [],
  });
  let release!: (value: typeof files) => void;
  const data = new Promise<typeof files>((r) => {
    release = r;
  });
  let fetchCalls = 0;
  engine.setProfileDataFetcher(() => {
    fetchCalls++;
    return data;
  });
  const start = performance.now();
  const pending = Array.from({ length: concurrency }, () =>
    engine.getTokenizerByName("synthetic")
  );
  release(files);
  const tokenizers = await Promise.all(pending);
  const coldMs = performance.now() - start;
  const uniqueInstances = new Set(tokenizers).size;
  const warm = await engine.getTokenizerByName("synthetic");
  const valid =
    tokenizers.every(
      (t) => t && JSON.stringify(t.encode("hello context")) === "[1,0]"
    ) && tokenizers.includes(warm);
  rows.push({
    concurrency,
    fetchCalls,
    uniqueInstances,
    cachedInstances: engine.getCacheSize(),
    coldMs,
    valid,
  });
  if (!valid) process.exitCode = 1;
}
const report = {
  createdAt: new Date().toISOString(),
  note: "Synthetic asset isolates initialization multiplicity; durations do not represent bundled model loading.",
  rows,
};
await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
