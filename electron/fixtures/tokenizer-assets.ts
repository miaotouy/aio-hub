// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const compressed = new Map<string, Promise<Buffer>>();

/** Same installed data and gzip layout as the production Vite asset plugin; no tokenizer mocks. */
export async function installBundledTokenizerFixture(
  directory: string,
  id = "gpt4o"
) {
  const target = path.join(directory, id);
  await fs.mkdir(target, { recursive: true });
  for (const name of ["tokenizer.json", "tokenizer_config.json"]) {
    const key = `${id}/${name}`;
    let pending = compressed.get(key);
    if (!pending) {
      pending = fs
        .readFile(require.resolve(`@lenml/tokenizer-${id}/models/${name}`))
        .then((bytes) => gzipSync(bytes));
      compressed.set(key, pending);
    }
    await fs.writeFile(path.join(target, `${name}.gz`), await pending);
  }
}
