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
  it("coalesces one hundred dirty signals into the running and final revision", async () => {
    const first = deferred<any>();
    const write = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ outcome: "committed", revision: 2, bytes: 1 });
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
    });
    let value = 0;

    coordinator.markSessionDirty("session-a", () => JSON.stringify({ value }));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    for (value = 1; value <= 100; value += 1) {
      coordinator.markSessionDirty("session-a", () =>
        JSON.stringify({ value })
      );
    }
    first.resolve({ outcome: "committed", revision: 1, bytes: 1 });

    await coordinator.flushSession("session-a");
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0].content).toBe('{"value":101}');
  });

  it("does not let a retry of an older snapshot overwrite a newer revision", async () => {
    const retry = deferred<any>();
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockReturnValueOnce(retry.promise)
      .mockResolvedValue({ outcome: "committed", revision: 3, bytes: 1 });
    const onBackgroundError = vi.fn();
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
      onBackgroundError,
    });
    let value = "first";

    coordinator.markSessionDirty("session-a", () => JSON.stringify({ value }));
    await vi.waitFor(() => expect(onBackgroundError).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    value = "latest";
    coordinator.markSessionDirty("session-a", () => JSON.stringify({ value }));
    retry.resolve({ outcome: "committed", revision: 2, bytes: 1 });

    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(3));
    expect(write.mock.calls[2][0].content).toBe('{"value":"latest"}');
    expect(write.mock.calls[2][0].revision).toBe(3);
  });

  it("retries a failed index commit through the same single writer slot", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("index disk unavailable"))
      .mockResolvedValue({ outcome: "committed", revision: 2, bytes: 1 });
    const onBackgroundError = vi.fn();
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
      onBackgroundError,
    });

    coordinator.markIndexDirty(() => '{"index":true}');
    await vi.waitFor(() => expect(onBackgroundError).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));

    expect(
      write.mock.calls.every(([request]) => request.kind === "index")
    ).toBe(true);
    expect(write.mock.calls.map(([request]) => request.revision)).toEqual([
      1, 2,
    ]);
  });

  it("backs off persistent session write retries instead of spinning in microtasks", async () => {
    const onBackgroundError = vi.fn();
    const write = vi.fn().mockRejectedValue(new Error("disk unavailable"));
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
      onBackgroundError,
    });

    coordinator.markSessionDirty("session-a", () => '{"id":"session-a"}');
    await vi.waitFor(() => expect(onBackgroundError).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(write).toHaveBeenCalledTimes(1);
    coordinator.markSessionDeleted("session-a");
  });

  it("limits independent session writes while keeping index commits separate", async () => {
    let activeSessions = 0;
    let maxActiveSessions = 0;
    const write = vi.fn(async (request) => {
      if (request.kind === "session") {
        activeSessions += 1;
        maxActiveSessions = Math.max(maxActiveSessions, activeSessions);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeSessions -= 1;
      }
      return {
        outcome: "committed" as const,
        revision: request.revision,
        bytes: 1,
      };
    });
    const coordinator = new SessionPersistenceCoordinator({
      writer: { write },
      maxConcurrentSessionWrites: 2,
    });
    const sessionIds = ["a", "b", "c", "d"];

    for (const sessionId of sessionIds) {
      coordinator.markSessionDirty(sessionId, () => `{"id":"${sessionId}"}`);
    }
    coordinator.markIndexDirty(() => '{"index":true}');
    await Promise.all([
      ...sessionIds.map((sessionId) => coordinator.flushSession(sessionId)),
      coordinator.flushIndex(),
    ]);

    expect(maxActiveSessions).toBe(2);
    expect(write.mock.calls.some(([request]) => request.kind === "index")).toBe(
      true
    );
  });
});
