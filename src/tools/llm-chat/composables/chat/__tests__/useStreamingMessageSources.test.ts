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
