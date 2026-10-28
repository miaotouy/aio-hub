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

function findNode(nodes: AstNode[], type: string): AstNode | undefined {
  for (const node of nodes) {
    if (node.type === type) return node;
    const child = findNode(node.children ?? [], type);
    if (child) return child;
  }
}

function describeFirstDifference(
  expected: unknown,
  actual: unknown,
  path = "$"
): string | undefined {
  if (Object.is(expected, actual)) return undefined;

  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (
      let index = 0;
      index < Math.min(expected.length, actual.length);
      index++
    ) {
      const difference = describeFirstDifference(
        expected[index],
        actual[index],
        `${path}[${index}]`
      );
      if (difference) return difference;
    }
    return expected.length === actual.length
      ? undefined
      : `${path}.length: expected ${expected.length}, received ${actual.length}`;
  }

  if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    for (const key of [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort()) {
      const difference = describeFirstDifference(
        left[key],
        right[key],
        `${path}.${key}`
      );
      if (difference) return difference;
    }
    return undefined;
  }

  return `${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
}
function createSeededChunks(input: string, seed: number): string[] {
  let state = seed >>> 0;
  const chunks: string[] = [];
  for (let offset = 0; offset < input.length;) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const size = 1 + (state % 13);
    chunks.push(input.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

const streamMarkdownFixtures = [
  {
    label: "table empty cells and escaped pipe split across chunks",
    chunks: [
      "| A | B | C |\n| --- | :---",
      ": | ---: |\n| | middle | |\n| left\\",
      "|right | last | value",
    ],
  },
  {
    label: "emphasis markers split across chunks",
    chunks: ["before *", "*bold", " text*", "* after\n\nnext"],
  },
  {
    label: "inline link destination split across chunks",
    chunks: ["[read this](https://exam", "ple.com/path", ' "title") and more'],
  },
  {
    label: "nested list and continuation split across chunks",
    chunks: [
      "1. parent\n   - child **bo",
      "ld**\n   - [link](https://example.com)\n",
      "   continuation\n2. sibling",
    ],
  },
  {
    label: "blockquote markers and nested content split across chunks",
    chunks: ["> quoted **te", "xt**\n> continuation\n>\n", "> - nested item"],
  },
  {
    label: "unclosed code fence recovers when its closing fence arrives",
    chunks: [
      "before\n\n```ts\nconst value = 1\n",
      "still code\n",
      "```\n\nafter",
    ],
  },
  {
    label: "unfinished emphasis and link recover as input continues",
    chunks: ["**unfinished [label](https://exam", "ple.com", ")** after"],
  },
];

const streamMarkdownCases = streamMarkdownFixtures.flatMap(
  ({ label, chunks }, index) => {
    const input = chunks.join("");
    const seed = 0x5eed + index;
    return [
      { label: `fixed boundaries: ${label}`, chunks },
      {
        label: `seeded boundaries (seed ${seed}): ${label}`,
        chunks: createSeededChunks(input, seed),
      },
    ];
  }
);

// Use the actual tokenizer while replacing only browser Worker transport in jsdom.
vi.mock("../../parser/tokenizerService", () => ({
  tokenizerService: {
    tokenize: async (text: string, options: TokenizerOptions) =>
      new Tokenizer(options).tokenize(text),
  },
}));

describe("streamed Markdown context", () => {
  // Protect full-content edits/reset and rewritten newline-terminated fence tails.
  it("re-evaluates fence context after full-content edits and reset", async () => {
    const state = useMarkdownAst({ throttleEnabled: false });
    const processor = new StreamProcessorV2({
      onPatch: (patches) => state.enqueuePatch(patches),
      safetyGuardEnabled: false,
    });
    const flush = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      for (const input of [
        "# title\n\n~~~\n",
        "# title\n\n~~~~md\n",
        "# title\n\n~~~~md\n<di\n",
        "# title\n\n~~~~md\n<div>\n~~~\n",
        "# title\n\n~~~~md\n<div>\n~~~~\n",
        "~~~js\nbody\n\n",
        "~~~js\nbody\n\n~~~\n\nafter",
        "~~~~js\nbody\n\n~~~\n\nstill code",
        "~~~js\nreplacement\n~~~\n\nafter",
      ]) {
        await processor.setContent(input);
        await flush();
        expect(normalizeAst(state.ast.value)).toEqual(
          normalizeAst(new CustomParser().parse(input))
        );
      }
      processor.reset();
      await processor.process("fresh");
      await flush();
      expect(normalizeAst(state.ast.value)).toEqual(
        normalizeAst(new CustomParser().parse("fresh"))
      );
    } finally {
      processor.destroy();
      state.dispose();
    }
  });

  // Equal text length and endpoints must still allow interior edits to become visible.
  it("updates interior text while retaining an unchanged stable heading", async () => {
    const state = useMarkdownAst({ throttleEnabled: false });
    const processor = new StreamProcessorV2({
      onPatch: (patches) => state.enqueuePatch(patches),
      safetyGuardEnabled: false,
    });
    const flush = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      await processor.setContent("# title\n\ncat");
      await flush();
      const stableId = state.ast.value[0].id;
      await processor.setContent("# title\n\ncot");
      await flush();
      expect(state.ast.value[0].id).toBe(stableId);
      expect(normalizeAst(state.ast.value)).toEqual(
        normalizeAst(new CustomParser().parse("# title\n\ncot"))
      );
    } finally {
      processor.destroy();
      state.dispose();
    }
  });

  // IDs are the public patch addressing contract: keep compatible identities,
  // give new subtrees unique IDs, and resolve later edits after a parent replacement.
  describe.each(["stream", "static"] as const)(
    "%s patch identities",
    (mode) => {
      const cases: {
        label: string;
        steps: { input: string; retained?: string[]; renewed?: string[] }[];
      }[] = [
        {
          label: "root recovery and consecutive insertion anchors",
          steps: [
            { input: "" },
            { input: "# anchor" },
            {
              input: "# anchor\n\n## second\n\n### third",
              retained: ["heading"],
            },
            { input: "# anchor\n\n## changed", retained: ["heading"] },
            { input: "" },
            { input: "# fresh\n\n## next" },
          ],
        },
        {
          label: "descendant edits after inline and parent replacements",
          steps: [
            { input: "> **same**" },
            {
              input: "> *same*",
              retained: ["blockquote", "paragraph"],
              renewed: ["text"],
            },
            {
              input: "> *same* [label](/first)",
              retained: ["blockquote", "paragraph", "em", "text"],
            },
            {
              input: "> *same* [label](/other)",
              retained: ["blockquote", "paragraph", "em", "link"],
            },
          ],
        },
        // List child diffing must preserve addressable IDs through append,
        // nested edits/removal, empty items and ordered-list prop changes.
        {
          label: "list growth and nested edits",
          steps: [
            { input: "- first\n\n  continued\n\n- tail" },
            {
              input: "- first\n\n  continued\n\n- tail extended\n\n- third",
              retained: ["list", "list_item", "paragraph", "text"],
            },
            {
              input: "- first\n\n  continued\n\n- tail\n  - nested **bold**",
              retained: ["list", "list_item", "paragraph", "text"],
            },
            { input: "- first", retained: ["list", "list_item"] },
            { input: "- ", retained: ["list", "list_item"] },
            { input: "- restored", retained: ["list", "list_item"] },
            { input: "3. ordered\n4. next" },
            { input: "5. changed\n6. next extended", retained: ["list"] },
          ],
        },
        {
          label: "code language changes and subsequent compatible edits",
          steps: [
            { input: "~~~js\nfirst\n~~~" },
            { input: "~~~ts\nfirst\n~~~", renewed: ["code_block"] },
            { input: "~~~ts\nsecond\n~~~", retained: ["code_block"] },
          ],
        },
      ];
      it.each(cases)("preserves $label", async ({ steps }) => {
        const state = useMarkdownAst({ throttleEnabled: false });
        const processor = new StreamProcessorV2({
          onPatch: (patches) => state.enqueuePatch(patches),
          safetyGuardEnabled: false,
        });
        const nodeIds = (nodes: AstNode[]): string[] =>
          nodes.flatMap((node) => [node.id, ...nodeIds(node.children || [])]);
        try {
          for (const { input, retained = [], renewed = [] } of steps) {
            const previous = state.ast.value;
            if (mode === "static") await processor.setStaticContent(input);
            else await processor.setContent(input);
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve())
            );
            const actual = state.ast.value;
            expect(normalizeAst(actual), input).toEqual(
              normalizeAst(new CustomParser().parse(input))
            );
            const ids = nodeIds(actual);
            expect(
              ids.every((id) => id.length > 0),
              input
            ).toBe(true);
            expect(new Set(ids).size, input).toBe(ids.length);
            for (const type of retained) {
              expect(findNode(previous, type)?.id, type).toBeTruthy();
              expect(findNode(actual, type)?.id, type).toBe(
                findNode(previous, type)?.id
              );
            }
            for (const type of renewed) {
              const oldId = findNode(previous, type)?.id;
              expect(oldId, type).toBeTruthy();
              expect(findNode(actual, type)?.id, type).not.toBe(oldId);
            }
          }
          await processor.finalize();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          );
          expect(normalizeAst(state.ast.value)).toEqual(
            normalizeAst(
              new CustomParser().parse(steps[steps.length - 1].input)
            )
          );
        } finally {
          processor.destroy();
          state.dispose();
        }
      });
    }
  );

  // Completion must leave the same processor ready for full edits and appended chunks.
  // Compare applied public patches with a fresh parse, independent of cache layout.
  it.each([
    {
      label: "an edited thinking block",
      before: "<think>cat",
      after: "<think>cot",
    },
    {
      label: "an edited tool request",
      before:
        "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Example「末」\npath:「始」cat「末」\n",
      after:
        "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Example「末」\npath:「始」cot「末」\n",
    },
    {
      label: "an unchanged stable heading with an edited tail",
      before: "# title\n\ncat",
      after: "# title\n\ncot",
    },
    { label: "cleared content", before: "cat", after: "" },
    { label: "unchanged content", before: "cat", after: "cat" },
    {
      label: "appended content",
      before: "cat",
      after: "cat tail",
      chunk: " tail",
    },
  ])(
    "resumes after finalization with $label",
    async ({ before, after, chunk }) => {
      const state = useMarkdownAst({ throttleEnabled: false });
      const processor = new StreamProcessorV2({
        onPatch: (patches) => state.enqueuePatch(patches),
        llmThinkTagNames: new Set(["think"]),
        safetyGuardEnabled: false,
      });
      const flush = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        await processor.setContent(before);
        await processor.finalize();
        await flush();
        if (chunk === undefined) await processor.setContent(after);
        else await processor.process(chunk);
        await flush();
        const expected = new CustomParser().parse(after);
        // The complete parser leaves tool execution state to the streaming layer.
        const expectedTool = findNode(expected, "vcp_tool");
        if (expectedTool?.type === "vcp_tool")
          expectedTool.props.isPending = true;
        expect(normalizeAst(state.ast.value)).toEqual(normalizeAst(expected));
      } finally {
        processor.destroy();
        state.dispose();
      }
    }
  );

  // Visible props can change while node text and its weak fingerprint stay equal.
  it.each([
    {
      label: "link destination",
      before: "[same](/one)",
      after: "[same](/two)",
      type: "link",
      props: { href: "/two" },
    },
    {
      label: "nested HTML attributes",
      before: '<div data-mode="cat">same</div>',
      after: '<div data-mode="cot">same</div>',
      type: "generic_html",
      props: { attributes: { "data-mode": "cot" } },
    },
    {
      label: "table alignment array",
      before: "| a | b |\n| :--- | ---: |\n| x | y |",
      after: "| a | b |\n| ---: | :--- |\n| x | y |",
      type: "table",
      props: { align: ["right", "left"] },
    },
  ])(
    "updates $label with unchanged visible text",
    async ({ before, after, type, props }) => {
      const state = useMarkdownAst({ throttleEnabled: false });
      const processor = new StreamProcessorV2({
        onPatch: (patches) => state.enqueuePatch(patches),
        safetyGuardEnabled: false,
      });
      const flush = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        await processor.setContent(before);
        await flush();
        const node = findNode(state.ast.value, type);
        expect(node).toBeDefined();
        await processor.setContent(after);
        await flush();
        expect(findNode(state.ast.value, type)).toMatchObject({
          id: node!.id,
          props,
        });
        expect(normalizeAst(state.ast.value)).toEqual(
          normalizeAst(new CustomParser().parse(after))
        );
      } finally {
        processor.destroy();
        state.dispose();
      }
    }
  );

  // Finalization changes animation flags without adding text; later edits must be fresh.
  it.each([
    {
      label: "thinking",
      type: "llm_think",
      flag: "isThinking",
      open: "<think>cat",
      close: "</think>",
    },
    {
      label: "tool execution",
      type: "vcp_tool",
      flag: "isPending",
      open: "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Example「末」\ncommand:「始」read「末」\npath:「始」cat「末」\n",
      close: "<<<[END_TOOL_REQUEST]>>>",
    },
  ])(
    "refreshes $label state through edits, completion, reset and closing",
    async ({ type, flag, open, close }) => {
      const state = useMarkdownAst({ throttleEnabled: false });
      const processor = new StreamProcessorV2({
        onPatch: (patches) => state.enqueuePatch(patches),
        llmThinkTagNames: new Set(["think"]),
        safetyGuardEnabled: false,
      });
      const flush = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        await processor.setContent(open);
        await flush();
        expect(findNode(state.ast.value, type)).toMatchObject({
          props: { [flag]: true },
        });
        const edited = open.replace("cat", "cot");
        await processor.setContent(edited);
        await flush();
        const editedNode = findNode(state.ast.value, type);
        expect(editedNode).toMatchObject({ props: { [flag]: true } });
        if (type === "vcp_tool") {
          expect(editedNode).toMatchObject({
            props: { args: { path: "cot" } },
          });
        } else {
          expect(editedNode).toMatchObject({ props: { rawContent: "cot" } });
        }
        await processor.finalize();
        await flush();
        expect(findNode(state.ast.value, type)).toMatchObject({
          props: { [flag]: false },
        });
        processor.reset();
        await processor.setContent(open);
        await flush();
        expect(findNode(state.ast.value, type)).toMatchObject({
          props: { [flag]: true },
        });
        await processor.setContent(open + close);
        await flush();
        expect(findNode(state.ast.value, type)).toMatchObject({
          props: { [flag]: false },
        });
      } finally {
        processor.destroy();
        state.dispose();
      }
    }
  );

  // Formula delimiters split across chunks or escaped in prose must preserve the result.
  it.each([
    ["closed display math", ["# before\n\n$$\nx", " + y\n$$\n\nafter"]],
    ["split dollar pairs", ["# before\n\n$", "$x$", "$\n\nafter"]],
    ["escaped dollars", ["# before\n\n\\$", "$ literal\n# after"]],
    ["adjacent dollar pairs", ["# before\n\n$$", "$$\n\nafter"]],
  ])("preserves %s through incremental updates", async (_label, chunks) => {
    const state = useMarkdownAst({ throttleEnabled: false });
    const processor = new StreamProcessorV2({
      onPatch: (patches) => state.enqueuePatch(patches),
      safetyGuardEnabled: false,
    });
    let input = "";
    try {
      for (const chunk of chunks) {
        input += chunk;
        await processor.process(chunk);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
        expect(normalizeAst(state.ast.value)).toEqual(
          normalizeAst(new CustomParser().parse(input))
        );
      }
    } finally {
      processor.destroy();
      state.dispose();
    }
  });

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

  it.each(streamMarkdownCases)(
    "finalizes $label to complete parsing",
    async ({ label, chunks }) => {
      const state = useMarkdownAst({ throttleEnabled: false });
      const processor = new StreamProcessorV2({
        onPatch: (patches) => state.enqueuePatch(patches),
        safetyGuardEnabled: false,
      });
      const flush = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      let input = "";
      let offset = 0;
      try {
        for (const chunk of chunks) {
          input += chunk;
          offset += chunk.length;
          await processor.process(chunk);
          await flush();
        }

        const expected = normalizeAst(new CustomParser().parse(input));
        const beforeFinalizeDifference = describeFirstDifference(
          expected,
          normalizeAst(state.ast.value)
        );

        await processor.finalize();
        await flush();
        const actual = normalizeAst(state.ast.value);
        const finalDifference = describeFirstDifference(expected, actual);
        const diagnostic = [
          `${label}, after ${chunks.length} chunks, UTF-16 offset ${offset}`,
          `final difference: ${finalDifference ? JSON.stringify(finalDifference) : "none"}`,
          `before finalize: ${beforeFinalizeDifference ? JSON.stringify(beforeFinalizeDifference) : "none"}`,
          `recent input: ${JSON.stringify(input.slice(-240))}`,
          `chunk sizes: ${chunks.map((item) => item.length).join(",")}`,
        ].join("\n");
        expect(actual, diagnostic).toEqual(expected);
      } finally {
        processor.destroy();
        state.dispose();
      }
    }
  );
});
