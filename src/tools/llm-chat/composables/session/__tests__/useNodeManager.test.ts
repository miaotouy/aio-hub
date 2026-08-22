import { describe, expect, it } from "vitest";
import type { ChatSessionDetail } from "../../../types/session";
import { useNodeManager } from "../useNodeManager";

describe("useNodeManager", () => {
  it("does not copy queue markers when creating a continuation branch", () => {
    const manager = useNodeManager();
    const root = manager.createNode({
      role: "system",
      content: "",
      parentId: null,
    });
    const user = manager.createNode({
      role: "user",
      content: "continue",
      parentId: root.id,
    });
    const queuedAssistant = manager.createNode({
      role: "assistant",
      content: "already generated",
      parentId: user.id,
      status: "waiting",
      metadata: {
        isQueued: true,
        agentId: "agent-1",
      },
    });

    const session = {
      id: "session-1",
      rootNodeId: root.id,
      activeLeafId: queuedAssistant.id,
      nodes: {},
    } as ChatSessionDetail;
    manager.addNodeToSession(session, root);
    manager.addNodeToSession(session, user);
    manager.addNodeToSession(session, queuedAssistant);

    const result = manager.createContinuationBranch(
      session,
      queuedAssistant.id
    );

    expect(result).not.toBeNull();
    expect(result?.assistantNode.metadata).toMatchObject({
      agentId: "agent-1",
      isContinuation: true,
    });
    expect(result?.assistantNode.metadata?.isQueued).toBeUndefined();
  });
});
