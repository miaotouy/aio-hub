// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { StreamController } from "../StreamController";
// Both first subscription replay and pre-mount buffering must preserve order at large sizes.
it.each([false, true])(
  "restores a large replay in order (preMount=%s)",
  (preMount) => {
    const emitted: string[] = [];
    const controller = new StreamController({
      onContent: (text) => emitted.push(text),
      smoothingEnabled: true,
    });
    const replay = "中文".repeat(250000);
    if (!preMount) controller.markMounted();
    controller.push("prefix ");
    controller.push(replay);
    controller.markMounted();
    // New arriving text must follow the restored history, including its final flush.
    controller.push(" suffix");
    controller.flushAndStop();
    expect(emitted.join("")).toBe("prefix " + replay + " suffix");
    expect(controller.getStatus().semanticQueueLength).toBe(0);
  }
);

// A minimized WebView must keep making progress and release every schedule on stop.
it("continues buffered display while hidden and releases its background timer on stop", async () => {
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  const emitted: string[] = [];
  const controller = new StreamController({
    onContent: (text) => emitted.push(text),
  });
  try {
    controller.markMounted();
    controller.start();
    controller.push("中文 👩🏽‍💻 e\u0301 end");
    await vi.advanceTimersByTimeAsync(2000);
    expect(emitted.join("").length).toBeGreaterThan(0);
    controller.flushAndStop();
    expect(emitted.join("")).toBe("中文 👩🏽‍💻 e\u0301 end");
    const calls = emitted.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(emitted).toHaveLength(calls);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    controller.stop();
    visibility.mockRestore();
    vi.useRealTimers();
  }
});

it("emits whole graphemes and fence headers after upstream splits every UTF-16 unit", async () => {
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  const units = ["```js\n", "👩🏽‍💻", "e\u0301", "\r\n", "```\n"];
  let length = 0;
  const ends = new Set(units.map((part) => (length += part.length)));
  const source = units.join("");
  let output = "";
  const controller = new StreamController({
    onContent: (text) => {
      output += text;
      expect(source.startsWith(output)).toBe(true);
      expect(
        ends.has(output.length),
        `unsafe displayed prefix ${output.length}`
      ).toBe(true);
    },
  });
  try {
    controller.markMounted();
    controller.start();
    for (let i = 0; i < source.length; i++) {
      controller.push(source[i]);
      await vi.advanceTimersByTimeAsync(250);
    }
    controller.flushAndStop();
    expect(output).toBe(source);
  } finally {
    controller.stop();
    visibility.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
