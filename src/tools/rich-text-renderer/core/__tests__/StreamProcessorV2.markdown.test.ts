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

import { describe, expect, it, vi } from "vitest";
import { Tokenizer } from "../../parser/Tokenizer";
import type { TokenizerOptions } from "../../parser/types";
import { StreamProcessorV2 } from "../StreamProcessorV2";
import { CustomParser } from "../CustomParser";
import { useMarkdownAst } from "../../composables/useMarkdownAst";
import type { AstNode } from "../../types";

function normalizeAst(nodes: AstNode[]): unknown {
  return nodes.map((node) => ({
    type: node.type,
    props: node.props,
    ...(node.children ? { children: normalizeAst(node.children) } : {}),
  }));
}

// Use the actual tokenizer while replacing only browser Worker transport in jsdom.
vi.mock("../../parser/tokenizerService", () => ({
  tokenizerService: {
    tokenize: async (text: string, options: TokenizerOptions) =>
      new Tokenizer(options).tokenize(text),
  },
}));

describe("streamed Markdown context", () => {
  it.each([
    [
      "long code fence",
      [
        "\x60\x60\x60\x60md\n\x60\x60\x60\n",
        "inside\n\n",
        "\x60\x60\x60\n\x60\x60\x60\x60\n\nafter",
      ],
    ],
    [
      "reference defined later",
      ["[visible][id]\n\n", '[id]: /url "title"', "\n\n[id]"],
    ],
    ["reference defined earlier", ['[id]: /url "title"\n\n', "[visible][id]"]],
    ["list continuation", ["3. first\n\n", "   continuation\n\n", "4. second"]],
  ])("matches complete parsing during %s updates", async (_label, chunks) => {
    const state = useMarkdownAst({ throttleEnabled: false });
    const processor = new StreamProcessorV2({
      onPatch: (patches) => state.enqueuePatch(patches),
      safetyGuardEnabled: false,
    });
    try {
      for (const chunk of chunks) await processor.process(chunk);
      const expected = normalizeAst(new CustomParser().parse(chunks.join("")));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      // Check before finalize too: final parsing must not hide incremental corruption.
      expect(normalizeAst(state.ast.value)).toEqual(expected);
      await processor.finalize();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      expect(normalizeAst(state.ast.value)).toEqual(expected);
    } finally {
      processor.destroy();
      state.dispose();
    }
  });
});
