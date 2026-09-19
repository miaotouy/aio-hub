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

/**
 * 通过 CDP 在**真实 WebView2** 内驱动滚动并采集帧时间。
 *
 * debug 构建与启用 `perf-instrumentation` feature 的 release 构建都通过
 * `AIO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS` 打开 loopback CDP。runner 不使用
 * Windows UIA、系统鼠标或系统键盘。
 */

export interface FrameSample {
  /** 采样窗口内的帧间隔（毫秒）。 */
  frameTimes: number[];
  durationMs: number;
}

export interface FrameStats {
  samples: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  over16_7: number;
  over33_3: number;
  over50: number;
  jankRatio: number;
}

export function summarizeFrames(frameTimes: number[]): FrameStats {
  if (frameTimes.length === 0) {
    return {
      samples: 0,
      fps: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      over16_7: 0,
      over33_3: 0,
      over50: 0,
      jankRatio: 0,
    };
  }
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const percentile = (ratio: number): number => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(ratio * sorted.length) - 1)
    );
    return sorted[index];
  };
  const over16_7 = frameTimes.filter((value) => value > 16.7).length;
  const over33_3 = frameTimes.filter((value) => value > 33.3).length;
  const over50 = frameTimes.filter((value) => value > 50).length;
  const total = frameTimes.reduce((sum, value) => sum + value, 0);
  return {
    samples: frameTimes.length,
    fps: total > 0 ? (frameTimes.length * 1000) / total : 0,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1],
    over16_7,
    over33_3,
    over50,
    jankRatio: over33_3 / frameTimes.length,
  };
}

interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

async function fetchTargets(port: number): Promise<CdpTarget[]> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list failed: HTTP ${response.status}`);
  }
  return (await response.json()) as CdpTarget[];
}

export interface FrameProbe {
  command<T>(method: string, params?: unknown): Promise<T>;
  evaluate<T>(expression: string): Promise<T>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

/**
 * 连接页面 target 并返回可复用探针。
 *
 * 采用 CDP `Runtime.evaluate`，与 WDIO 的 `browser.execute` 语义一致，
 * 但不依赖 debug-only 的 WebDriver 插件。
 */
export async function connectFrameProbe(
  port: number,
  options: { targetUrlIncludes?: string; timeoutMs?: number } = {}
): Promise<FrameProbe> {
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let target: CdpTarget | undefined;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets(port);
      target = targets.find(
        (item) =>
          item.type === "page" &&
          (!options.targetUrlIncludes ||
            item.url.includes(options.targetUrlIncludes))
      );
      if (target?.webSocketDebuggerUrl) break;
    } catch {
      // WebView2 尚未就绪，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(
      `No CDP page target on port ${port}. Debug builds enable it automatically; release builds must include the perf-instrumentation feature.`
    );
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("CDP websocket open timed out")),
      15_000
    );
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP websocket error"));
    });
  });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (payload.id === undefined) return;
    const entry = pending.get(payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    if (payload.error)
      entry.reject(new Error(payload.error.message ?? "CDP error"));
    else entry.resolve(payload.result);
  });

  const send = <T>(method: string, params: unknown = {}): Promise<T> => {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };

  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await send<{
      result: { value?: T };
      exceptionDetails?: { text?: string };
    }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `CDP evaluate failed: ${result.exceptionDetails.text ?? "unknown"}`
      );
    }
    return result.result.value as T;
  };

  return {
    command: send,
    evaluate,
    async waitForSelector(selector: string, timeoutMs = 60_000) {
      const stopAt = Date.now() + timeoutMs;
      while (Date.now() < stopAt) {
        const found = await evaluate<boolean>(
          `!!document.querySelector(${JSON.stringify(selector)})`
        );
        if (found) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`Selector not found within ${timeoutMs}ms: ${selector}`);
    },
    async close() {
      socket.close();
    },
  };
}

export interface OpenLlmChatResult {
  messageCount: number;
  path: string;
}

/** 从真实首页进入 LLM Chat，并等待播种的长会话完成渲染。 */
export async function openLlmChatAndWait(
  probe: FrameProbe,
  options: { timeoutMs?: number; anchorText?: string } = {}
): Promise<OpenLlmChatResult> {
  const deadline = Date.now() + (options.timeoutMs ?? 150_000);
  const anchorText = options.anchorText ?? "[239-0]";
  while (Date.now() < deadline) {
    const status = await probe.evaluate<{
      ready: boolean;
      clicked: boolean;
      messageCount: number;
      path: string;
    }>(`(() => {
      const list = document.querySelector('.message-list');
      const input = document.querySelector('[data-testid="chat-message-input"]');
      const text = document.body?.innerText ?? '';
      const messages = document.querySelectorAll('[data-testid="chat-message"]');
      const ready = !!list && !!input && text.includes(${JSON.stringify(anchorText)});
      if (ready) return { ready: true, clicked: false, messageCount: messages.length, path: location.pathname };
      let clicked = false;
      if (location.pathname !== '/llm-chat') {
        const link = Array.from(document.querySelectorAll('a[href]')).find((candidate) => {
          try { return new URL(candidate.href, location.href).pathname === '/llm-chat'; }
          catch { return false; }
        });
        if (link instanceof HTMLElement) { link.click(); clicked = true; }
      }
      return { ready: false, clicked, messageCount: messages.length, path: location.pathname };
    })()`);
    if (status.ready)
      return { messageCount: status.messageCount, path: status.path };
    await delay(status.clicked ? 750 : 300);
  }
  throw new Error(
    `LLM Chat did not render fixture anchor ${JSON.stringify(anchorText)} within ${options.timeoutMs ?? 150_000}ms.`
  );
}

export interface TallMessageSliceCheck {
  messageId: string;
  height: number;
  sliceCount: number;
}

/**
 * 在真实 WebView2 中验证 fixture 的超高消息实际触发 ChatMessage 背景分片。
 *
 * 仅生成长文本不足以覆盖该路径：`content-visibility` 下必须把元素滚入视口，
 * 等待 ResizeObserver 更新，之后才可断言 `.message-background-slice` 的实际数量。
 */
export async function verifyTallMessageSlices(
  probe: FrameProbe,
  messageIds: string[]
): Promise<TallMessageSliceCheck[]> {
  if (messageIds.length === 0) {
    throw new Error("Tall-message fixture must include at least one message.");
  }
  const result = await probe.evaluate<{
    checks: TallMessageSliceCheck[];
    missing: string[];
  }>(`(async () => {
    const ids = ${JSON.stringify(messageIds)};
    const list = document.querySelector('.message-list');
    if (!(list instanceof HTMLElement)) {
      throw new Error('Message list not found for tall-message validation');
    }
    const settle = () => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const checks = [];
    const missing = [];
    for (const id of ids) {
      const element = Array.from(document.querySelectorAll('[data-testid="chat-message"]')).find(
        (candidate) => candidate.getAttribute('data-message-id') === id
      );
      if (!(element instanceof HTMLElement)) {
        missing.push(id);
        continue;
      }
      element.scrollIntoView({ block: 'center' });
      await settle();
      await settle();
      checks.push({
        messageId: id,
        height: Math.ceil(element.getBoundingClientRect().height),
        sliceCount: element.querySelectorAll('.message-background-slice').length,
      });
    }
    list.scrollTop = 0;
    await settle();
    return { checks, missing };
  })()`);

  if (result.missing.length > 0) {
    throw new Error(
      `Tall-message fixture nodes were not rendered: ${result.missing.join(', ')}`
    );
  }
  const invalid = result.checks.filter(
    (check) => check.height <= 2000 || check.sliceCount < 2
  );
  if (invalid.length > 0) {
    throw new Error(
      `Tall-message background slicing was not exercised: ${invalid
        .map(
          (check) =>
            `${check.messageId} (${check.height}px, ${check.sliceCount} slice(s))`
        )
        .join(', ')}`
    );
  }
  return result.checks;
}

export interface CdpWheelScroll {
  done: Promise<void>;
  stop(): void;
}

/** 通过 CDP Input domain 注入滚轮事件，不移动系统光标或获取前台焦点。 */
export async function startCdpWheelScroll(
  probe: FrameProbe,
  selector: string,
  options: {
    durationMs: number;
    stepPx: number;
    intervalMs: number;
    reverseMs?: number;
  }
): Promise<CdpWheelScroll> {
  const target = await probe.evaluate<{ x: number; y: number }>(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error('Scroll target not found');
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || element.scrollHeight <= element.clientHeight) throw new Error('Scroll target is not visible or scrollable');
    element.scrollTop = 0;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  let stopped = false;
  const done = (async () => {
    const startedAt = Date.now();
    const reverseMs = options.reverseMs ?? 3_000;
    let reverseAt = startedAt + reverseMs;
    let direction = 1;
    while (!stopped && Date.now() - startedAt < options.durationMs) {
      const now = Date.now();
      if (now >= reverseAt) {
        direction *= -1;
        reverseAt = now + reverseMs;
      }
      await probe.command("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: target.x,
        y: target.y,
        deltaX: 0,
        deltaY: direction * options.stepPx,
        pointerType: "mouse",
      });
      const remaining = options.durationMs - (Date.now() - startedAt);
      if (remaining > 0) await delay(Math.min(options.intervalMs, remaining));
    }
  })();
  return {
    done,
    stop() {
      stopped = true;
    },
  };
}

/** 在页面内采样帧间隔；滚动负载由 CDP Input domain 独立驱动。 */
export function frameSamplingExpression(options: {
  durationMs: number;
}): string {
  return `(() => {
  const duration = ${options.durationMs};
  const frameTimes = [];
  let last = performance.now();
  const start = last;
  return new Promise((resolve) => {
    const tick = (now) => {
      frameTimes.push(now - last);
      last = now;
      if (now - start < duration) requestAnimationFrame(tick);
      else resolve({ frameTimes, durationMs: now - start });
    };
    requestAnimationFrame(tick);
  });
})()`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
