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

import { expect, it, vi } from "vitest";
import { HostShutdown } from "./host-shutdown";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("joins repeated/reentrant quits, snapshots first, and drains every owner before exiting", async () => {
  const a = deferred(),
    b = deferred();
  const events: string[] = [];
  const exit = vi.fn();
  const host = new HostShutdown({
    snapshot: () => {
      events.push("snapshot");
      void host.request(9);
    },
    stop: () => [
      () => {
        events.push("a");
        return a.promise;
      },
      () => {
        events.push("b");
        return b.promise;
      },
    ],
    report: vi.fn(),
    exit,
  });
  const first = host.request(3);
  expect(host.started).toBe(true);
  expect(host.request(4)).toBe(first);
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toEqual(["snapshot", "a", "b"]);
  a.resolve();
  await Promise.resolve();
  expect(exit).not.toHaveBeenCalled();
  b.resolve();
  await first;
  expect(exit.mock.calls).toEqual([[3]]);
});
it("reports snapshot and owner failures while still awaiting successful owners", async () => {
  const pending = deferred();
  const report = vi.fn(),
    exit = vi.fn();
  const host = new HostShutdown({
    snapshot: () => {
      throw Error("disk");
    },
    stop: () => [
      () => {
        throw Error("owner");
      },
      () => pending.promise,
    ],
    report,
    exit,
  });
  const task = host.request();
  await Promise.resolve();
  await Promise.resolve();
  expect(exit).not.toHaveBeenCalled();
  pending.resolve();
  await task;
  expect(report.mock.calls.map(([error]) => error.message)).toEqual([
    "disk",
    "owner",
  ]);
  expect(exit).toHaveBeenCalledWith(0);
});
