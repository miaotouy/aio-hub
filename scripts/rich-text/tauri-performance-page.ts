// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { RendererActivity } from "./tauri-memory-page";

export interface TauriPerformanceSample {
  mode: "static" | "stream";
  startAt: number;
  mountedAt: number;
  sendStartAt: number;
  finishRequestedAt: number;
  finalContentFrameAt: number;
  verifiedAt: number;
  validationMs: number;
  deliveries: {
    scheduledAt: number;
    deliveredAt: number;
    characters: number;
  }[];
  commitFrames: number[];
  commits: RendererActivity["commits"];
  frames: number[];
  longTasks: { startTime: number; duration: number }[];
  components: RendererActivity["components"];
  dom: ReturnType<NonNullable<Window["__RICH_TEXT_MEMORY__"]>["dom"]>;
  finalMatches: boolean;
}

/** Runs the clock and deliveries inside WebView2, without a CDP round trip per chunk. */
export async function runTauriPerformancePage(options: {
  mode: "static" | "stream";
  markdown: string;
  chunks: string[];
  intervalMs: number;
  expectedSignature: string;
}): Promise<TauriPerformanceSample> {
  if (document.hidden)
    throw new Error("Keep the measured Tauri window visible");
  if (!PerformanceObserver.supportedEntryTypes.includes("longtask"))
    throw new Error("WebView2 long-task observation is unavailable");
  const harness = window.__RICH_TEXT_MEMORY__!;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const frame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const frames: number[] = [];
  const longTasks: TauriPerformanceSample["longTasks"] = [];
  const appendTasks = (entries: PerformanceEntry[]) => {
    for (const entry of entries)
      longTasks.push({ startTime: entry.startTime, duration: entry.duration });
  };
  const observer = new PerformanceObserver((list) =>
    appendTasks(list.getEntries())
  );
  observer.observe({ type: "longtask" });
  let frameId = 0;
  const sampleFrame = () => {
    frames.push(performance.now());
    frameId = requestAnimationFrame(sampleFrame);
  };
  frameId = requestAnimationFrame(sampleFrame);
  const badge = document.getElementById("rich-text-memory-probe-status")!;
  badge.textContent =
    "V2 自研解析器 · 界面性能采样 · " +
    (options.mode === "static" ? "完整内容" : "流式输入");
  const errors: unknown[] = [];
  const pending: Promise<void>[] = [];
  const startAt = performance.now();
  try {
    await harness.mount(
      options.mode === "static" ? "static" : "source",
      options.mode === "static" ? options.markdown : ""
    );
    badge.textContent =
      "V2 自研解析器 · 界面性能采样 · " +
      (options.mode === "static" ? "完整内容" : "流式输入");
    const mountedAt = performance.now();
    const deliveries: TauriPerformanceSample["deliveries"] = [];
    const sendStartAt = performance.now();
    if (options.mode === "stream") {
      for (let i = 0; i < options.chunks.length; i++) {
        const scheduledAt = sendStartAt + i * options.intervalMs;
        const wait = scheduledAt - performance.now();
        if (wait > 0) await sleep(wait);
        deliveries.push({
          scheduledAt,
          deliveredAt: performance.now(),
          characters: options.chunks[i].length,
        });
        // push synchronously dispatches to StreamSource; its frame wait never paces the sender.
        pending.push(
          harness.push(options.chunks[i]).catch((error) => {
            errors.push(String(error));
          })
        );
      }
    }
    const finishRequestedAt = performance.now();
    if (options.mode === "stream") await harness.finish();
    await Promise.all(pending);
    if (errors.length)
      throw new Error("Stream delivery failed: " + errors.join("; "));
    await frame();
    await frame();
    const deadline = performance.now() + 30000;
    let finalMatches = false;
    let validationMs = 0;
    // Validation is kept after delivery. Completion uses the subsequent paint
    // opportunity as an explicit upper bound, so a newly queued commit is covered.
    while (performance.now() < deadline) {
      await frame();
      await frame();
      const validationStart = performance.now();
      const actual = await harness.signature();
      validationMs += performance.now() - validationStart;
      if (actual === options.expectedSignature) {
        finalMatches = true;
        break;
      }
      await sleep(100);
    }
    if (!finalMatches)
      throw new Error(
        "Final renderer AST did not match the full parse within 30 s"
      );
    if (document.hidden) throw new Error("Measured Tauri window became hidden");
    const verifiedAt = performance.now();
    await frame();
    await frame();
    const finalContentFrameAt = performance.now();
    await sleep(0);
    appendTasks(observer.takeRecords());
    const activity = harness.activity();
    if (!activity.commitFrames.length)
      throw new Error("No Vue component frame was observed");
    return {
      mode: options.mode,
      startAt,
      mountedAt,
      sendStartAt,
      finishRequestedAt,
      finalContentFrameAt,
      verifiedAt,
      validationMs,
      deliveries,
      commitFrames: [...activity.commitFrames],
      commits: [...activity.commits],
      frames,
      longTasks,
      components: activity.components,
      dom: harness.dom(),
      finalMatches,
    };
  } finally {
    cancelAnimationFrame(frameId);
    observer.disconnect();
  }
}
