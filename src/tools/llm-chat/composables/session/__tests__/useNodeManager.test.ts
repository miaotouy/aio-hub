import { describe, expect, it } from "vitest";
import type { MessageRole } from "../../../types/common";
import type { ChatSessionDetail } from "../../../types/session";
import { useNodeManager } from "../useNodeManager";

describe("useNodeManager", () => {
  // 高级编辑保存完整数据时保留原分支，并保护新节点的身份和树关系。
  it("saves edited node data to a sibling without changing the source or copying tree links", () => {
    const manager = useNodeManager();
    const root = manager.createNode({
      role: "system",
      content: "root",
      parentId: null,
    });
    const source = manager.createNode({
      role: "assistant",
      content: "original",
      parentId: root.id,
      metadata: { modelId: "old" },
    });
    const child = manager.createNode({
      role: "user",
      content: "follow up",
      parentId: source.id,
    });
    const session = {
      id: "session",
      rootNodeId: root.id,
      activeLeafId: child.id,
      nodes: {},
    } as ChatSessionDetail;
    [root, source, child].forEach((node) =>
      manager.addNodeToSession(session, node)
    );
    const before = structuredClone([source, child]);
    const edited = {
      ...structuredClone(source),
      id: "injected",
      parentId: child.id,
      childrenIds: [root.id],
      content: "edited",
      name: "new name",
      status: "generating" as const,
      metadata: {
        modelId: "edited-model",
        reasoningContent: "kept reasoning",
        isQueued: true,
        reasoningActive: true,
      },
    };
    const branch = manager.createBranchFromEdit(
      session,
      source.id,
      edited.content,
      undefined,
      edited
    )!;
    expect(branch.id).not.toBe(source.id);
    expect(branch.id).not.toBe("injected");
    expect(branch).toMatchObject({
      parentId: root.id,
      childrenIds: [],
      content: "edited",
      name: "new name",
      status: "complete",
      metadata: {
        modelId: "edited-model",
        reasoningContent: "kept reasoning",
        reasoningActive: false,
      },
    });
    expect(branch.metadata?.isQueued).toBeUndefined();
    expect(root.childrenIds).toEqual([source.id, branch.id]);
    expect([source, child]).toEqual(before);
    edited.metadata.modelId = "later edit";
    expect(branch.metadata?.modelId).toBe("edited-model");
  });

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

  it.each(["user", "tool"] as const)(
    "creates a reply below the selected %s node and reuses its context",
    (role) => {
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
      const target = manager.createNode({
        role,
        content: "result to reuse",
        parentId: toolCall.id,
      });
      const oldReply = manager.createNode({
        role: "assistant",
        content: "partial response",
        parentId: target.id,
        status: "error",
      });
      const session = {
        id: "session-1",
        rootNodeId: root.id,
        activeLeafId: target.id,
        nodes: {},
      } as ChatSessionDetail;
      for (const node of [root, user, toolCall, target, oldReply]) {
        manager.addNodeToSession(session, node);
      }
      const originalReply = structuredClone(oldReply);

      const result = manager.createRegenerateBranch(session, target.id);

      expect(result).not.toBeNull();
      expect(result!.userNode).toBe(target);
      expect(result!.assistantNode).toMatchObject({
        role: "assistant",
        content: "",
        parentId: target.id,
        status: "waiting",
      });
      expect(target.childrenIds).toEqual([
        oldReply.id,
        result!.assistantNode.id,
      ]);
      expect(manager.getNodePath(session, result!.userNode.id)).toEqual([
        root,
        user,
        toolCall,
        target,
      ]);
      expect(oldReply).toEqual(originalReply);
      expect(Object.keys(session.nodes)).toHaveLength(6);
    }
  );

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
