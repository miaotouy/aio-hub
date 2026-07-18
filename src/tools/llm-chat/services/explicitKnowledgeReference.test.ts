import { describe, expect, it } from "vitest";
import type {
  KnowledgeReference,
  KnowledgeToolSearchResponse,
} from "@/tools/knowledge-base/types";
import type { ChatMessageNode, ChatSessionDetail } from "../types";
import {
  completeExplicitKnowledgeToolEvent,
  createExplicitKnowledgeToolEvent,
  failExplicitKnowledgeToolEvent,
} from "./explicitKnowledgeReference";

function node(
  id: string,
  role: ChatMessageNode["role"],
  parentId: string | null
): ChatMessageNode {
  return {
    id,
    parentId,
    childrenIds: [],
    content: role === "user" ? "问题" : "",
    role,
    status: role === "assistant" ? "generating" : "complete",
  };
}

const reference: KnowledgeReference = {
  schemaVersion: 1,
  type: "knowledge",
  libraryIds: ["library-a"],
  mode: "search",
  libraries: [{ id: "library-a", name: "资料 A", availability: "available" }],
};

function setup() {
  const userNode = node("user-a", "user", "root");
  const assistantNode = node("assistant-a", "assistant", userNode.id);
  userNode.childrenIds.push(assistantNode.id);
  const session = {
    id: "session-a",
    updatedAt: "2026-07-18T00:00:00.000Z",
    nodes: {
      [userNode.id]: userNode,
      [assistantNode.id]: assistantNode,
    },
    rootNodeId: "root",
    activeLeafId: assistantNode.id,
    history: [],
    historyIndex: -1,
  } satisfies ChatSessionDetail;
  let sequence = 0;
  const nodeManager = {
    createNode: (config: any) => ({
      id: "tool-" + ++sequence,
      parentId: config.parentId,
      childrenIds: [],
      content: config.content,
      role: config.role,
      status: config.status,
      metadata: config.metadata,
    }),
    addNodeToSession: (target: ChatSessionDetail, child: ChatMessageNode) => {
      target.nodes[child.id] = child;
      target.nodes[child.parentId!].childrenIds.push(child.id);
    },
  };
  return { session, userNode, assistantNode, nodeManager };
}

describe("explicit Knowledge tool event", () => {
  it("inserts a visible user -> tool -> assistant chain and round-trips the reference", () => {
    const { session, userNode, assistantNode, nodeManager } = setup();
    const event = createExplicitKnowledgeToolEvent(
      nodeManager,
      session,
      userNode,
      assistantNode,
      "agent-a",
      "问题",
      reference
    );

    expect(userNode.childrenIds).toEqual([event.toolNode.id]);
    expect(event.toolNode.childrenIds).toEqual([assistantNode.id]);
    expect(assistantNode.parentId).toBe(event.toolNode.id);
    expect(event.toolNode.metadata?.toolCalls?.[0]).toMatchObject({
      toolName: "knowledge.search",
      status: "executing",
    });
    expect(
      JSON.parse(JSON.stringify(session.nodes[userNode.id])).knowledgeReference
    ).toEqual(reference);
  });

  it("persists source linkage on success", () => {
    const { session, userNode, assistantNode, nodeManager } = setup();
    const event = createExplicitKnowledgeToolEvent(
      nodeManager,
      session,
      userNode,
      assistantNode,
      "agent-a",
      "问题",
      reference
    );
    const result = {
      query: "问题",
      requestedStrategy: "auto",
      traces: [],
      totalCandidates: 1,
      truncated: false,
      hits: [
        {
          libraryId: "library-a",
          documentId: "document-a",
          chunkId: "chunk-a",
          chunkIndex: 0,
          title: "文档 A",
          sourcePath: "docs/a.md",
          snippet: "证据",
          score: 1,
          rankScore: 1,
          signals: [],
        },
      ],
    } satisfies KnowledgeToolSearchResponse;

    completeExplicitKnowledgeToolEvent(
      event,
      userNode,
      "问题",
      reference,
      result,
      "result",
      12
    );

    expect(event.toolNode.status).toBe("complete");
    expect(event.toolNode.metadata?.toolCalls?.[0]).toMatchObject({
      status: "success",
      resultMetadata: {
        userMessageId: userNode.id,
        resultCount: 1,
        sources: [{ chunkId: "chunk-a", sourcePath: "docs/a.md" }],
      },
    });
  });

  it("records a structured failure instead of continuing as ordinary text", () => {
    const { session, userNode, assistantNode, nodeManager } = setup();
    const event = createExplicitKnowledgeToolEvent(
      nodeManager,
      session,
      userNode,
      assistantNode,
      "agent-a",
      "问题",
      reference
    );

    failExplicitKnowledgeToolEvent(
      event,
      userNode,
      "问题",
      reference,
      "资料库不可用",
      "LIBRARY_UNAVAILABLE",
      8
    );

    expect(event.toolNode.metadata?.toolCalls?.[0]).toMatchObject({
      status: "error",
      resultMetadata: {
        userMessageId: userNode.id,
        failureType: "LIBRARY_UNAVAILABLE",
      },
    });
  });
});
