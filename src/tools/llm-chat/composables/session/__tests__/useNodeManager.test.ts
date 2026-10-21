import { describe, expect, it } from "vitest";
import type { MessageRole } from "../../../types/common";
import type { ChatSessionDetail } from "../../../types/session";
import { useNodeManager } from "../useNodeManager";

describe("useNodeManager", () => {
  it.each<MessageRole>(["user", "tool", "assistant", "system"])(
    "regenerates an assistant under its actual %s parent and preserves the old branch",
    (parentRole) => {
      const manager = useNodeManager();
      const root = manager.createNode({
        role: "system",
        content: "system prompt",
        parentId: null,
      });
      const user = manager.createNode({
        role: "user",
        content: "look it up",
        parentId: root.id,
      });
      const toolCall = manager.createNode({
        role: "assistant",
        content: "calling the tool",
        parentId: user.id,
      });
      const parent = manager.createNode({
        role: parentRole,
        content: "result to reuse",
        parentId: toolCall.id,
      });
      const failedAssistant = manager.createNode({
        role: "assistant",
        content: "partial response",
        parentId: parent.id,
        status: "error",
        metadata: { error: "interrupted" },
      });
      const descendant = manager.createNode({
        role: "user",
        content: "follow-up on the original branch",
        parentId: failedAssistant.id,
      });
      const session = {
        id: "session-1",
        rootNodeId: root.id,
        activeLeafId: descendant.id,
        nodes: {},
      } as ChatSessionDetail;
      for (const node of [
        root,
        user,
        toolCall,
        parent,
        failedAssistant,
        descendant,
      ]) {
        manager.addNodeToSession(session, node);
      }
      const originalBranch = structuredClone([failedAssistant, descendant]);

      const result = manager.createRegenerateBranch(
        session,
        failedAssistant.id
      );

      expect(result).not.toBeNull();
      const regenerated = result!.assistantNode;
      expect(result!.userNode).toBe(parent);
      expect(regenerated).toMatchObject({
        role: "assistant",
        parentId: parent.id,
        content: "",
        status: "waiting",
        childrenIds: [],
      });
      expect(session.nodes[regenerated.id]).toBe(regenerated);
      expect(parent.childrenIds).toEqual([failedAssistant.id, regenerated.id]);
      expect(
        manager.getNodePath(session, regenerated.id).map((node) => node.id)
      ).toEqual([root.id, user.id, toolCall.id, parent.id, regenerated.id]);
      expect([failedAssistant, descendant]).toEqual(originalBranch);
      expect(Object.keys(session.nodes)).toHaveLength(7);
    }
  );

  it("creates a reply below a selected user node", () => {
    const manager = useNodeManager();
    const user = manager.createNode({
      role: "user",
      content: "try again",
      parentId: null,
    });
    const session = {
      id: "session-1",
      rootNodeId: user.id,
      activeLeafId: user.id,
      nodes: { [user.id]: user },
    } as ChatSessionDetail;

    const result = manager.createRegenerateBranch(session, user.id);

    expect(result?.userNode).toBe(user);
    expect(result?.assistantNode.parentId).toBe(user.id);
    expect(user.childrenIds).toEqual([result!.assistantNode.id]);
  });

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
