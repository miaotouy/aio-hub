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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardMonitor } from "./clipboard-monitor";
let monitor: ClipboardMonitor;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  monitor.disposeAll();
  vi.useRealTimers();
});
describe("clipboard monitoring window leases", () => {
  it("deduplicates start and content updates and keeps another window running after stop", async () => {
    let text = '{"name":"Aurora"}';
    const readText = vi.fn(async () => text),
      emit = vi.fn(() => true);
    monitor = new ClipboardMonitor({ readText, emit, onError: vi.fn() });
    monitor.start(1);
    monitor.start(1);
    monitor.start(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(readText).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls).toEqual([
      [1, text],
      [2, text],
    ]);
    expect(monitor.contentType(1)).toBe("json");
    monitor.disposeOwner(1);
    text = "changed";
    await vi.advanceTimersByTimeAsync(500);
    expect(emit.mock.calls.at(-1)).toEqual([2, "changed"]);
    expect(monitor.contentType(1)).toBe("text");
    monitor.disposeOwner(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(readText).toHaveBeenCalledTimes(3);
  });
  it("gives each new lease its current text and preserves existing content-type rules", async () => {
    let text = "x/".repeat(60) + "==";
    const emit = vi.fn(() => true);
    monitor = new ClipboardMonitor({
      readText: async () => text,
      emit,
      onError: vi.fn(),
    });
    monitor.start(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(monitor.contentType(1)).toBe("base64");
    monitor.start(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(emit.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    text = "";
    await vi.advanceTimersByTimeAsync(500);
    expect(emit).toHaveBeenCalledTimes(2);
    text = "[1,2]";
    await vi.advanceTimersByTimeAsync(500);
    expect(monitor.contentType(2)).toBe("text");
  });
  it("discards a read belonging to an old document lease and prevents overlapping OS reads", async () => {
    let resolve!: (text: string) => void;
    const readText = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r;
          })
      ),
      emit = vi.fn(() => true);
    monitor = new ClipboardMonitor({ readText, emit, onError: vi.fn() });
    monitor.start(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(readText).toHaveBeenCalledTimes(1);
    monitor.disposeOwner(1);
    monitor.start(1);
    resolve("old document text");
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    resolve("new document text");
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenCalledWith(1, "new document text");
    monitor.disposeAll();
    await vi.advanceTimersByTimeAsync(1000);
    expect(readText).toHaveBeenCalledTimes(2);
  });
  it("recovers from OS read failures and releases a gone receiver", async () => {
    const failure = new Error("Clipboard busy"),
      onError = vi.fn();
    const readText = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue('{"ok":true}');
    monitor = new ClipboardMonitor({ readText, emit: () => false, onError });
    monitor.start(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(readText).toHaveBeenCalledTimes(2);
    expect(monitor.contentType(1)).toBe("text");
  });
});
