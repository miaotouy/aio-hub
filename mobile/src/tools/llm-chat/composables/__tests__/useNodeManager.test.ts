import { describe, expect, it } from "vitest";
import { useNodeManager } from "../useNodeManager";
import type { ChatSession } from "../../types";

function session(): ChatSession {
  return {
    id: "session-1",
    name: "Continuation test",
    rootNodeId: "root",
    activeLeafId: "assistant-source",
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["user-1"],
        role: "system",
        status: "complete",
        content: "",
      },
      "user-1": {
        id: "user-1",
        parentId: "root",
        childrenIds: ["assistant-source"],
        role: "user",
        status: "complete",
        content: "Continue this",
      },
      "assistant-source": {
        id: "assistant-source",
        parentId: "user-1",
        childrenIds: [],
        role: "assistant",
        status: "complete",
        content: "Original reply",
        metadata: {
          modelId: "model-1",
          modelDisplayName: "Model 1",
          error: "old error",
          interrupted: true,
          usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
          contentTokens: 3,
          requestStartTime: 1,
        },
      },
    },
  };
}

describe("useNodeManager continuation branch", () => {
  it("clones an assistant reply as a generating sibling without carrying old generation state", () => {
    const target = session();
    const branch = useNodeManager().createContinuationBranch(
      target,
      "assistant-source"
    );

    expect(branch).not.toBeNull();
    expect(target.nodes["assistant-source"]).toMatchObject({
      status: "complete",
      content: "Original reply",
    });
    expect(branch).toMatchObject({
      parentId: "user-1",
      role: "assistant",
      status: "generating",
      content: "Original reply",
      metadata: {
        modelId: "model-1",
        modelDisplayName: "Model 1",
        isContinuation: true,
        continuationPrefix: "Original reply",
      },
    });
    expect(branch?.metadata).not.toHaveProperty("error");
    expect(branch?.metadata).not.toHaveProperty("interrupted");
    expect(branch?.metadata).not.toHaveProperty("usage");
    expect(branch?.metadata).not.toHaveProperty("contentTokens");
    expect(target.nodes["user-1"].childrenIds).toEqual([
      "assistant-source",
      branch?.id,
    ]);
    expect(target.activeLeafId).toBe(branch?.id);
  });

  it("rejects a generating assistant as a continuation source", () => {
    const target = session();
    target.nodes["assistant-source"].status = "generating";

    expect(
      useNodeManager().createContinuationBranch(target, "assistant-source")
    ).toBeNull();
    expect(target.nodes["user-1"].childrenIds).toEqual(["assistant-source"]);
  });
});
