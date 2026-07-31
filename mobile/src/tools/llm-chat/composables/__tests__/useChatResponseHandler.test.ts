import { describe, expect, it } from "vitest";
import { useChatResponseHandler } from "../useChatResponseHandler";
import type { ChatSession } from "../../types";

function session(): ChatSession {
  return {
    id: "session-1",
    name: "Response test",
    rootNodeId: "root",
    activeLeafId: "assistant-continuation",
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["assistant-continuation"],
        role: "system",
        status: "complete",
        content: "",
      },
      "assistant-continuation": {
        id: "assistant-continuation",
        parentId: "root",
        childrenIds: [],
        role: "assistant",
        status: "generating",
        content: "Original reply",
        metadata: {
          isContinuation: true,
          continuationPrefix: "Original reply",
        },
      },
    },
  };
}

describe("useChatResponseHandler continuation finalization", () => {
  it("preserves the copied prefix when the provider returns only newly generated content", async () => {
    const target = session();

    await useChatResponseHandler().finalizeNode(
      target,
      "assistant-continuation",
      { content: " continued", usage: { completionTokens: 2 } }
    );

    expect(target.nodes["assistant-continuation"]).toMatchObject({
      status: "complete",
      content: "Original reply continued",
      metadata: expect.objectContaining({ contentTokens: 2 }),
    });
  });

  it("does not duplicate a prefix returned by a provider", async () => {
    const target = session();

    await useChatResponseHandler().finalizeNode(
      target,
      "assistant-continuation",
      { content: "Original reply continued", usage: { completionTokens: 2 } }
    );

    expect(target.nodes["assistant-continuation"].content).toBe(
      "Original reply continued"
    );
  });
});
