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
import { SystemPulse } from "./system-pulse";
class Runtime {
  finish!: () => void;
  fail!: (error: Error) => void;
  latest: unknown = null;
  run = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        this.finish = resolve;
        this.fail = reject;
      })
  );
  cancel = vi.fn();
  drainSnapshot = vi.fn(() => {
    const value = this.latest;
    this.latest = null;
    return JSON.stringify(value);
  });
}
let runtimes: Runtime[], emit: ReturnType<typeof vi.fn>, service: SystemPulse;
beforeEach(() => {
  vi.useFakeTimers();
  runtimes = [];
  emit = vi.fn();
  service = new SystemPulse("app", {
    emit,
    loadAddon: () => ({
      SystemPulseRuntime: class extends Runtime {
        constructor() {
          super();
          runtimes.push(this);
        }
      },
    }),
  });
});
afterEach(async () => {
  for (const runtime of runtimes) runtime.finish?.();
  await service.shutdown();
  vi.useRealTimers();
});
const start = (owner: number, id: string) =>
  service.runCommand(owner, "start_pulse", { subscriptionId: id });
const stop = (owner: number, id?: string) =>
  service.runCommand(owner, "stop_pulse", { subscriptionId: id });
const tick = () => vi.advanceTimersByTimeAsync(100);
describe("system pulse ownership and collector lifetime", () => {
  it("shares one collector and forwards snapshots only to current subscribers", async () => {
    await start(1, "a");
    await start(1, "b");
    await start(2, "peer");
    expect(runtimes).toHaveLength(1);
    runtimes[0].latest = { timestamp: 1, cpu: { globalUsage: 3 } };
    await tick();
    expect(emit.mock.calls).toEqual([
      [
        1,
        "system-pulse:snapshot",
        { timestamp: 1, cpu: { globalUsage: 3 }, subscriptionId: "b" },
      ],
      [
        2,
        "system-pulse:snapshot",
        { timestamp: 1, cpu: { globalUsage: 3 }, subscriptionId: "peer" },
      ],
    ]);
    await stop(1, "a"); // Old subscription cannot pause its replacement.
    await stop(9); // An unrelated window cannot stop subscribers.
    expect(runtimes[0].cancel).not.toHaveBeenCalled();
    await stop(1, "b");
    emit.mockClear();
    runtimes[0].latest = { timestamp: 2 };
    await tick();
    expect(emit.mock.calls).toEqual([
      [2, "system-pulse:snapshot", { timestamp: 2, subscriptionId: "peer" }],
    ]);
  });
  it("waits for the last worker to release resources before a new start", async () => {
    await start(1, "a");
    const stopped = stop(1, "a");
    expect(runtimes[0].cancel).toHaveBeenCalledOnce();
    const restarted = start(2, "b");
    await Promise.resolve();
    expect(runtimes).toHaveLength(1);
    runtimes[0].latest = { timestamp: 3 };
    await tick();
    expect(emit).not.toHaveBeenCalled();
    runtimes[0].finish();
    await stopped;
    await restarted;
    expect(runtimes).toHaveLength(2);
  });
  it("discards a queued start when its owner closes", async () => {
    await start(1, "a");
    const stopped = stop(1);
    const pending = start(2, "b");
    service.disposeOwner(2);
    runtimes[0].finish();
    await Promise.all([stopped, pending]);
    expect(runtimes).toHaveLength(1);
    expect(service.hasPendingOperations).toBe(false);
  });
  it("keeps the peer active on owner disposal and drains during shutdown", async () => {
    await start(1, "a");
    await start(2, "b");
    service.disposeOwner(1);
    expect(runtimes[0].cancel).not.toHaveBeenCalled();
    let finished = false;
    const shutdown = service.shutdown().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    await expect(start(3, "c")).rejects.toThrow("应用正在退出");
    runtimes[0].finish();
    await shutdown;
    expect(service.hasPendingOperations).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reports a collector failure and allows a fresh explicit retry", async () => {
    await start(1, "a");
    runtimes[0].fail(new Error("hardware unavailable"));
    await tick();
    expect(emit).toHaveBeenCalledWith(1, "system-pulse:error", {
      subscriptionId: "a",
      message: "hardware unavailable",
    });
    expect(service.hasPendingOperations).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await start(1, "retry");
    expect(runtimes).toHaveLength(2);
  });
  it("cleans failed addon startup and permits retry", async () => {
    const load = vi
      .fn()
      .mockImplementationOnce(() => {
        throw Error("addon missing");
      })
      .mockReturnValue({ SystemPulseRuntime: Runtime });
    const missing = new SystemPulse("app", { emit, loadAddon: load });
    await expect(missing.runCommand(1, "start_pulse")).rejects.toThrow(
      "addon missing"
    );
    expect(missing.hasPendingOperations).toBe(false);
    // The next request must reach the loader again, rather than retain a dead subscription.
    load.mockImplementation(() => {
      throw Error("retry reached loader");
    });
    await expect(missing.runCommand(1, "start_pulse")).rejects.toThrow(
      "retry reached loader"
    );
    await missing.shutdown();
  });
});
