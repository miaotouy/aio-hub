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

import { describe, expect, it } from "vitest";
import {
  appendStreamingMessageChunk,
  completeAndDisposeStreamingMessageSource,
  disposeStreamingMessageSource,
  getOrCreateStreamingMessageSource,
} from "../useStreamingMessageSources";

describe("useStreamingMessageSources", () => {
  it("replays buffered content to new subscribers and emits later deltas", async () => {
    const nodeId = `node-${Date.now()}-${Math.random()}`;
    const received: string[] = [];

    appendStreamingMessageChunk(nodeId, "hello");
    appendStreamingMessageChunk(nodeId, " world");

    const source = getOrCreateStreamingMessageSource(nodeId);
    source.subscribe((chunk) => received.push(chunk));

    await Promise.resolve();
    expect(received).toEqual(["hello world"]);

    appendStreamingMessageChunk(nodeId, "!");
    expect(received).toEqual(["hello world", "!"]);

    disposeStreamingMessageSource(nodeId);
  });

  it("notifies completion subscribers", async () => {
    const nodeId = `node-${Date.now()}-${Math.random()}`;
    const completed: boolean[] = [];

    const source = getOrCreateStreamingMessageSource(nodeId, "done");
    source.onComplete?.(() => completed.push(true));

    completeAndDisposeStreamingMessageSource(nodeId, 0);
    expect(completed).toEqual([true]);

    await Promise.resolve();
  });
});

// A subscriber sees its captured history, intervening chunks and completion in that order.
it("orders append and completion arriving before the replay microtask", async () => {
  const id = "replay-race";
  const source = getOrCreateStreamingMessageSource(id, "history");
  const events: string[] = [];
  source.subscribe((text) => events.push(text));
  source.onComplete?.(() => events.push("complete"));
  appendStreamingMessageChunk(id, "-new");
  completeAndDisposeStreamingMessageSource(id);
  await Promise.resolve();
  expect(events).toEqual(["history", "-new", "complete"]);
  disposeStreamingMessageSource(id);
});
it("cancels an unsubscribed replay while remaining subscribers receive the full sequence", async () => {
  const id = "replay-cancel";
  const source = getOrCreateStreamingMessageSource(id, "history");
  const cancelled: string[] = [],
    received: string[] = [];
  const off = source.subscribe((text) => cancelled.push(text));
  source.subscribe((text) => received.push(text));
  appendStreamingMessageChunk(id, "-new");
  off();
  await Promise.resolve();
  expect(cancelled).toEqual([]);
  expect(received.join("")).toBe("history-new");
  disposeStreamingMessageSource(id);
});
