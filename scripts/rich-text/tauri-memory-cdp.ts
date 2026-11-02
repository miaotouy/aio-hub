// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { CDPSession } from "playwright-core";
interface HeapUsage {
  usedSize: number;
  totalSize: number;
  embedderHeapUsedSize?: number;
  backingStorageSize?: number;
}

/** Inspect only tokenizer workers in the verified instance's browser. */
export async function tokenizerHeaps(browser: CDPSession, gc: boolean) {
  const targets = (await browser.send("Target.getTargets")).targetInfos.filter(
    (target) =>
      target.type === "worker" && target.url.includes("tokenizer.worker")
  );
  const heaps: {
    targetId: string;
    url: string;
    heap: HeapUsage;
  }[] = [];
  for (const target of targets) {
    const { sessionId } = await browser.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: false,
    });
    let id = 0;
    // Non-flattened child sessions let Playwright forward worker commands while
    // preserving the existing page/worker lifecycle and application connection.
    async function request(method: string): Promise<unknown> {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Worker CDP timed out: ${method}`));
        }, 10000);
        const cleanup = () => {
          clearTimeout(timer);
          browser.off("Target.receivedMessageFromTarget", received);
        };
        const received = (event: { sessionId: string; message: string }) => {
          if (event.sessionId !== sessionId) return;
          const message = JSON.parse(event.message) as {
            id?: number;
            result?: unknown;
            error?: { message: string };
          };
          if (message.id !== requestId) return;
          cleanup();
          if (message.error) reject(new Error(message.error.message));
          else resolve(message.result);
        };
        browser.on("Target.receivedMessageFromTarget", received);
        void browser
          .send("Target.sendMessageToTarget", {
            sessionId,
            message: JSON.stringify({ id: requestId, method }),
          })
          .catch((error) => {
            cleanup();
            reject(error);
          });
      });
    }
    try {
      if (gc) await request("HeapProfiler.collectGarbage");
      const heap = (await request("Runtime.getHeapUsage")) as HeapUsage;
      heaps.push({ targetId: target.targetId, url: target.url, heap });
    } finally {
      await browser.send("Target.detachFromTarget", { sessionId });
    }
  }
  return heaps;
}
