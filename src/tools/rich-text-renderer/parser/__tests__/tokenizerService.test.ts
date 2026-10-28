// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tokenizer } from "../Tokenizer";
import { TokenizerWorkerState } from "../tokenizerWorkerState";
import { tokenizerService } from "../tokenizerService";
import type { TokenizerOptions } from "../types";
import type { TokenizerRequest } from "../tokenizerProtocol";

// Exercise real tokenization and wire cloning, replacing only browser scheduling.
class LoopbackWorker {
  static instances: LoopbackWorker[] = [];
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
      if (response)
        this.onmessage?.({ data: structuredClone(response) } as MessageEvent);
    });
  }
  terminate() {}
}

beforeEach(() => {
  LoopbackWorker.instances = [];
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
