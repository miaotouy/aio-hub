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

import { describe, expect, it, vi } from "vitest";
import { SessionPersistenceCoordinator } from "../sessionPersistenceCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SessionPersistenceCoordinator", () => {
  it("runs one session write at a time and coalesces dirty state to the newest snapshot", async () => {
    const first = deferred<any>();
    const write = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ outcome: "committed", revision: 2, bytes: 1 });
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
    });
    let state = "first";

    coordinator.markSessionDirty("session-a", (_revision) =>
      JSON.stringify({ state })
    );
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    state = "last";
    coordinator.markSessionDirty("session-a", (_revision) =>
      JSON.stringify({ state })
    );
    first.resolve({ outcome: "committed", revision: 1, bytes: 1 });

    await coordinator.flushSession("session-a");
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.map(([request]) => request.content)).toEqual([
      '{"state":"first"}',
      '{"state":"last"}',
    ]);
    expect(write.mock.calls.map(([request]) => request.revision)).toEqual([
      1, 2,
    ]);
  });

  it("does not allow a late running write to revive a deleted session", async () => {
    const running = deferred<any>();
    const write = vi.fn().mockReturnValue(running.promise);
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
    });

    coordinator.markSessionDirty(
      "session-a",
      (_revision) => '{"id":"session-a"}'
    );
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    coordinator.markSessionDirty(
      "session-a",
      (_revision) => '{"id":"session-a","new":true}'
    );
    coordinator.markSessionDeleted("session-a");
    running.resolve({ outcome: "committed", revision: 1, bytes: 1 });

    const result = await coordinator.flushSession("session-a");
    expect(result.outcome).toBe("cancelled");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("serializes all index writes through a single slot", async () => {
    const first = deferred<any>();
    const write = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ outcome: "committed", revision: 2, bytes: 1 });
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
    });
    let index = 1;

    coordinator.markIndexDirty((_revision) => JSON.stringify({ index }));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    index = 2;
    coordinator.markIndexDirty((_revision) => JSON.stringify({ index }));
    first.resolve({ outcome: "committed", revision: 1, bytes: 1 });

    await coordinator.flushIndex();
    expect(write).toHaveBeenCalledTimes(2);
    expect(
      write.mock.calls.every(([request]) => request.kind === "index")
    ).toBe(true);
    expect(write.mock.calls.map(([request]) => request.content)).toEqual([
      '{"index":1}',
      '{"index":2}',
    ]);
  });
});
