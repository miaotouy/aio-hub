// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomParser } from "../../core/CustomParser";
import { Tokenizer } from "../Tokenizer";
import { TokenizerWorkerState } from "../tokenizerWorkerState";
import { tokenizerService } from "../tokenizerService";
import type { TokenizerOptions } from "../types";
import type { TokenizerRequest, TokenizerResponse } from "../tokenizerProtocol";

// Exercise real tokenization and wire cloning, replacing only browser scheduling.
class LoopbackWorker {
  static instances: LoopbackWorker[] = [];
  static responseSizes: number[] = [];
  transformResponse?: (response: TokenizerResponse) => TokenizerResponse;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: ErrorEvent) => void;
  private state = new TokenizerWorkerState();
  constructor() {
    LoopbackWorker.instances.push(this);
  }
  postMessage(value: TokenizerRequest) {
    const request = structuredClone(value);
    queueMicrotask(() => {
      const response = this.state.handle(request);
      if (response) {
        const delivered = this.transformResponse?.(response) ?? response;
        LoopbackWorker.responseSizes.push(JSON.stringify(delivered).length);
        this.onmessage?.({ data: structuredClone(delivered) } as MessageEvent);
      }
    });
  }
  terminate() {}
}

beforeEach(() => {
  LoopbackWorker.instances = [];
  LoopbackWorker.responseSizes = [];
  vi.stubGlobal("Worker", LoopbackWorker);
});
afterEach(() => {
  tokenizerService.terminate();
  vi.unstubAllGlobals();
});

// Owners share the Worker, while every full-content update must match standalone lexing.
it("returns complete tokens across interleaved streams, edits, options and release", async () => {
  const owners = [{}, {}];
  const sequences = [
    [
      "# 开始\n",
      "# 开始\n\n~~~js\nconst α = '😀';\n",
      "# 开始\n\n~~~js\nconst α = '😀';\n~~~\n",
      "# 开始\n\n~~~js\nconst α = '😀';\n~~~~\n\n末尾",
      "# 修改\n\n[link][id]\n\n[id]: /first",
      "# 修改\n\n[link][id]\n\n[id]: /other",
      "",
      "重新开始\n",
    ],
    [
      "<style>\n**text**",
      "<style>\n**text**\n</style>",
      "<style>\n**text**\n</style>\n\nleft | right\n",
      "<style>\n**text**\n</style>\n\nleft | right\n--- | ---\na | b",
      "<script>\nconst x = '<p>字';\n</script>",
      "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Example「末」\n<<<[END_TOOL_REQUEST]>>>",
      "",
      "新文档\n",
    ],
  ];
  const pending = [];
  for (let index = 0; index < sequences[0].length; index++) {
    for (let stream = 0; stream < owners.length; stream++) {
      const text = sequences[stream][index];
      const options: TokenizerOptions = {
        vcpFuzzyModeEnabled: index % 2 === 0,
      };
      const result = tokenizerService.tokenize(text, options, owners[stream]);
      pending.push(
        result.then((tokens) =>
          expect(tokens).toEqual(new Tokenizer(options).tokenize(text))
        )
      );
    }
  }
  await Promise.all(pending);
  tokenizerService.release(owners[0]);
  const next = "同一调用方的新会话\n\n* item";
  expect(await tokenizerService.tokenize(next, {}, owners[0])).toEqual(
    new Tokenizer().tokenize(next)
  );
  expect(await tokenizerService.tokenize("静态文档")).toEqual(
    new Tokenizer().tokenize("静态文档")
  );
});

// A disposed owner's in-flight results remain valid, isolated from its replacement stream.
it("isolates pending responses when an owner is released and reused", async () => {
  const owner = {};
  const first = tokenizerService.tokenize("first\n", {}, owner);
  const second = tokenizerService.tokenize("first\nsecond\n", {}, owner);
  tokenizerService.release(owner);
  const replacement = tokenizerService.tokenize("replacement\n", {}, owner);
  const texts = ["first\n", "first\nsecond\n", "replacement\n"];
  const tokens = await Promise.all([first, second, replacement]);
  tokens.forEach((value, index) =>
    expect(value).toEqual(new Tokenizer().tokenize(texts[index]))
  );
});

// Restarting the shared Worker must reject its pending jobs and resume complete results.
it("recovers tokenization after termination or a Worker failure", async () => {
  const owner = {};
  const abandoned = tokenizerService.tokenize("abandoned\n", {}, owner);
  const rejection = expect(abandoned).rejects.toThrow("terminated");
  tokenizerService.terminate();
  const text = "after restart\n";
  const restarted = tokenizerService.tokenize(text, {}, owner);
  await rejection;
  expect(await restarted).toEqual(new Tokenizer().tokenize(text));
  const interrupted = tokenizerService.tokenize(text + "tail\n", {}, owner);
  const failed = expect(interrupted).rejects.toThrow("crashed");
  LoopbackWorker.instances[LoopbackWorker.instances.length - 1]!.onerror?.({
    message: "test Worker failure",
  } as ErrorEvent);
  await failed;
  const recovered = "恢复中文 😀\n";
  expect(await tokenizerService.tokenize(recovered, {}, owner)).toEqual(
    new Tokenizer().tokenize(recovered)
  );
});

// Full token results stay immutable while the wire carries substantially less growing source.
it("preserves large queued token revisions while reducing repeated string payloads", async () => {
  const body = "const 文本 = '😀';\n".repeat(1600);
  const frames = [
    { open: "# Header\n\n~~~js\n", close: "\n~~~\n" },
    {
      open: "<<<[ROLE_DIVIDE_ASSISTANT]>>>\n",
      close: "\n<<<[END_ROLE_DIVIDE_ASSISTANT]>>>",
    },
  ];
  let growthPayloadSize = 0;
  let completeGrowthSize = 0;
  for (const frame of frames) {
    const owner = {};
    const original = frame.open + body;
    const appended = original + "尾部 😀\n";
    const edited =
      appended.slice(0, 9000) + "修改字符000000" + appended.slice(9010);
    const shortened = edited.slice(0, -1000);
    const texts = [
      original,
      appended,
      edited,
      shortened,
      shortened + frame.close,
    ];
    const responseOffset = LoopbackWorker.responseSizes.length;
    const results = await Promise.all(
      texts.map((text) => tokenizerService.tokenize(text, {}, owner))
    );
    // Compare after all responses have arrived, so later reconstruction cannot mutate old results.
    results.forEach((tokens, index) => {
      const expected = new Tokenizer().tokenize(texts[index]);
      expect(tokens).toEqual(expected);
      if (index === 1) completeGrowthSize += JSON.stringify(expected).length;
    });
    growthPayloadSize += LoopbackWorker.responseSizes[responseOffset + 1];
    tokenizerService.release(owner);
  }
  expect(growthPayloadSize).toBeLessThan(completeGrowthSize * 0.25);
});

// A malformed patch must reject queued jobs cleanly and allow a fresh stream to recover.
it("recovers from a rejected text patch without reusing its incomplete revision", async () => {
  const owner = {};
  const text = "~~~txt\n" + "原文😀\n".repeat(2000);
  await tokenizerService.tokenize(text, {}, owner);
  const worker = LoopbackWorker.instances[0];
  worker.transformResponse = (response) => {
    worker.transformResponse = undefined;
    return response.status === "success"
      ? {
          ...response,
          prefix: 0,
          textPatches: true,
          tokens: [
            {
              type: "code_fence",
              language: "txt",
              raw: { from: 0, to: text.length * 2, insert: "" },
            },
          ],
        }
      : response;
  };
  const corrupted = expect(
    tokenizerService.tokenize(text + "tail", {}, owner)
  ).rejects.toThrow("patch mismatch");
  const queued = expect(
    tokenizerService.tokenize(text + "tail\nmore", {}, owner)
  ).rejects.toThrow("response mismatch");
  await Promise.all([corrupted, queued]);
  const recovered = text + "恢复\n~~~";
  expect(await tokenizerService.tokenize(recovered, {}, owner)).toEqual(
    new Tokenizer().tokenize(recovered)
  );
});

// Completion consumes an acknowledged snapshot and releases its owner for the next document.
it("completes an acknowledged document without another Worker response and honors changed options", async () => {
  const owner = {};
  const text = "- [read][id]\n\n[id]: /target\n";
  const expected = new Tokenizer().tokenize(text);
  await tokenizerService.tokenize(text, {}, owner);
  const replies = LoopbackWorker.responseSizes.length;
  expect(await tokenizerService.complete(text, {}, owner)).toEqual(expected);
  expect(LoopbackWorker.responseSizes).toHaveLength(replies);
  const next = "new document";
  expect(await tokenizerService.tokenize(next, {}, owner)).toEqual(
    new Tokenizer().tokenize(next)
  );
  tokenizerService.release(owner);

  const options = { vcpFuzzyModeEnabled: false };
  const malformed =
    "<<<[TOOL_REQUEST]>>>\ntool_name:「始」DailyNote「末」,\nContent:「始ESCAPE」正文「末」\n<<<[END_TOOL_REQUEST]>>>\n\nafter";
  await tokenizerService.tokenize(malformed, options, owner);
  options.vcpFuzzyModeEnabled = true;
  expect(await tokenizerService.complete(malformed, options, owner)).toEqual(
    new Tokenizer(options).tokenize(malformed)
  );
});

// Completing before queued replies arrive must not mix its base with a replacement stream.
it("finishes queued revisions independently of a following stream from the same owner", async () => {
  const owner = {};
  const text = "~~~txt\n" + "原文😀\n".repeat(2200);
  const first = tokenizerService.tokenize(text, {}, owner);
  const second = tokenizerService.tokenize(text + "tail", {}, owner);
  const completed = tokenizerService.complete(text + "tail", {}, owner);
  const replacement = "[next][id]\n\n[id]: /replacement";
  const following = tokenizerService.tokenize(replacement, {}, owner);
  const results = await Promise.all([first, second, completed, following]);
  [text, text + "tail", text + "tail", replacement].forEach((source, index) =>
    expect(results[index]).toEqual(new Tokenizer().tokenize(source))
  );
  expect(await tokenizerService.complete(replacement, {}, owner)).toEqual(
    new Tokenizer().tokenize(replacement)
  );
});

// Complete parsing must rebuild whole-document references and keep reset/new-document ownership isolated.
it("rebuilds complete parser output while reset and a new pending document overtake old completion", async () => {
  const parser = new CustomParser();
  const source = '# Stable\n\n<div title="unfinished';
  const pending = parser.parsePendingAsync(source);
  const completed = parser.parseCompleteAsync(source);
  parser.reset();
  const next = "- [next][id]\n\n[id]: /target\n";
  const following = parser.parsePendingAsync(next);
  await pending;
  expect(await completed).toEqual(new CustomParser().parse(source));
  await following;
  expect(await parser.parseCompleteAsync(next)).toEqual(
    new CustomParser().parse(next)
  );
  expect(await parser.parseCompleteAsync("")).toEqual([]);
});

// List-item retention must follow token lookahead and whole-document reference changes.
it("keeps pending list membership and references correct through continued input and revisions", async () => {
  const parser = new CustomParser();
  const initial =
    "- first [target][id]\n\n  continued **inside**\n\n- second\n\n  - nested tail\n";
  const texts = [
    initial,
    initial + "    continuation\n",
    initial + "\n- third\n",
    initial.replace("- second", "1. second"),
    initial.replace("  - nested tail", "- new root"),
    initial.replace("  continued", "continued"),
    initial + "\n[id]: /one\n",
    initial + '\n[id]: /two "title"\n',
    initial.slice(0, 45),
    "- [one](/a)  \n  [two](/b)  \n  ![badge](/img)\n\n- tail\n",
    "- [one](/a) •  \n  [two](/b)\n\n- tail\n",
    "- [one](/a) •  \n  [two](/b)\n\n- tail\n\n- appended\n",
    "- [one](/a) •  \n  [two](/changed)\n\n- tail\n",
    "- [one](/a) long separator  \n  [two](/b)\n\n- tail\n",
    "- A\n\n  | key | value |\n  | --- | --- |\n  | a | b |\n\n- B\n",
    "- A\n\n  <div>late\n\n- B\n",
    "- A\n\n  <div>late\n\n- B\n\n  </div>\n",
    initial,
  ];
  try {
    for (const source of texts)
      expect(await parser.parsePendingAsync(source)).toEqual(
        new CustomParser().parse(source)
      );
    expect(await parser.parseCompleteAsync(initial)).toEqual(
      new CustomParser().parse(initial)
    );
    parser.reset();
    expect(await parser.parsePendingAsync("- fresh\n\n- tail\n")).toEqual(
      new CustomParser().parse("- fresh\n\n- tail\n")
    );
  } finally {
    parser.reset();
  }
});

// Prefix reuse must observe lexical metadata as well as the visible text.
it("keeps optional metadata and nested token maps current across repeated prefixes", async () => {
  const owner = {};
  const sequences = [
    ["&copy;\n\nend", "©\n\nend", "&#169;\n\nend"],
    ["first\n  next", "first\n    next", "first\nnext"],
    ["```js\nvalue\n", "```js\nvalue\n```\n", "```ts\nvalue\n```\n"],
    [
      '<div title="first" data-id="1">x</div>',
      '<div title="next" data-id="1">x</div>',
      '<div data-id="1">x</div>',
    ],
    [
      "[key]: /one 'title'\n\n[key]",
      "[key]: /two 'title'\n\n[key]",
      "[key]: /two 'other'\n\n[key]",
    ],
    [
      "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Example「末」\ncommand:「始」run「末」\nvalue:「始」first「末」\n<<<[END_TOOL_REQUEST]>>>",
      "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Example「末」\ncommand:「始」run「末」\nvalue:「始」next「末」\n<<<[END_TOOL_REQUEST]>>>",
    ],
  ];
  for (const sequence of sequences) {
    for (const text of sequence) {
      expect(await tokenizerService.tokenize(text, {}, owner)).toEqual(
        new Tokenizer().tokenize(text)
      );
      expect(await tokenizerService.tokenize(text, {}, owner)).toEqual(
        new Tokenizer().tokenize(text)
      );
    }
    tokenizerService.release(owner);
  }
});
