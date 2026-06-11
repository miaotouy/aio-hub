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
