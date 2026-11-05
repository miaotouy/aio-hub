// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** Release a caller promptly; shared owner work retains handlers and completes independently. */
export function waitForOwnerOperation<T>(
  operation: () => T | Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  const task = Promise.resolve().then(() => {
    signal?.throwIfAborted();
    return operation();
  });
  if (!signal) return task;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("已取消", "AbortError"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    // Keep handlers on the owner operation even if cancellation won the race.
    task.then(
      (value) => {
        cleanup();
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}
