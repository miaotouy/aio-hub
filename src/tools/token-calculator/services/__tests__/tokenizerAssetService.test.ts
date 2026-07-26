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

import { gzipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenizerProfile } from "../../types/tokenizer-profile";

vi.mock("virtual:aiohub-builtin-tokenizer-assets", () => ({
  default: {
    "@lenml/tokenizer-test": {
      tokenizerUrl: "/tokenizers/test/tokenizer.json.gz",
      tokenizerConfigUrl: "/tokenizers/test/tokenizer_config.json.gz",
    },
  },
}));

import { readProfileFiles } from "../tokenizerAssetService";

const profile: TokenizerProfile = {
  id: "test",
  name: "Test tokenizer",
  version: "1",
  modelPatterns: [],
  source: { type: "bundled", packageName: "@lenml/tokenizer-test" },
  confidence: "exact",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readProfileFiles", () => {
  it("解压内置 gzip 资产并返回给 Worker 的 JSON 文本", async () => {
    const responses = new Map([
      [
        "/tokenizers/test/tokenizer.json.gz",
        gzipSync(strToU8('{"version":"1.0"}')),
      ],
      [
        "/tokenizers/test/tokenizer_config.json.gz",
        gzipSync(strToU8('{"model_max_length":42}')),
      ],
    ]);
    const fetchMock = vi.fn(async (url: string) => {
      const body = responses.get(url);
      return body
        ? new Response(body, { status: 200 })
        : new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(readProfileFiles(profile)).resolves.toEqual({
      tokenizerJSON: '{"version":"1.0"}',
      tokenizerConfigJSON: '{"model_max_length":42}',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
