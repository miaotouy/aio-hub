import { describe, expect, it } from "vitest";
import type { ChatMessageNode, ChatSession } from "../../types";
import {
  buildPersistChatChanges,
  chatSessionToMessageInputs,
  decodeChatSessionSnapshot,
  recoverInterruptedChatMessages,
} from "../chatStorageCodec";
import type { ChatSessionSnapshot } from "../chatStorageService";

function node(
  id: string,
  parentId: string | null,
  content: string,
  childrenIds: string[] = []
): ChatMessageNode {
  return {
    id,
    parentId,
    childrenIds,
    content,
    role: id === "root" ? "system" : "user",
    status: "complete",
    type: "message",
    timestamp: "2026-07-21T00:00:00.000Z",
  };
}

function session(nodes: Record<string, ChatMessageNode>): ChatSession {
  return {
    id: "session-1",
    name: "Codec test",
    nodes,
    rootNodeId: "root",
    activeLeafId: "assistant-2",
    displayAgentId: "agent-1",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:01.000Z",
  };
}

describe("chat storage codec", () => {
  it("encodes a tree in parent-first order with local sibling indexes", () => {
    const current = session({
      root: node("root", null, "", ["user", "user-2"]),
      user: node("user", "root", "hello", ["assistant-1"]),
      "assistant-1": node("assistant-1", "user", "answer"),
      "user-2": node("user-2", "root", "second", ["assistant-2"]),
      "assistant-2": node("assistant-2", "user-2", "answer 2"),
    });

    expect(
      chatSessionToMessageInputs(current).map((row) => [
        row.id,
        row.siblingOrder,
      ])
    ).toEqual([
      ["root", 0],
      ["user", 0],
      ["assistant-1", 0],
      ["user-2", 1],
      ["assistant-2", 0],
    ]);
  });

  it("only upserts changed rows and sends minimal branch delete roots", () => {
    const previous = session({
      root: node("root", null, "", ["user"]),
      user: node("user", "root", "hello", ["assistant-1", "assistant-2"]),
      "assistant-1": node("assistant-1", "user", "old answer"),
      "assistant-2": node("assistant-2", "user", "kept answer"),
    });
    const current = session({
      root: node("root", null, "", ["user"]),
      user: node("user", "root", "hello", ["assistant-2"]),
      "assistant-2": node("assistant-2", "user", "kept answer"),
    });

    const changes = buildPersistChatChanges(current, previous);
    expect(changes.deleteMessageIds).toEqual(["assistant-1"]);
    expect(changes.upsertMessages).toEqual([
      expect.objectContaining({ id: "assistant-2", siblingOrder: 0 }),
    ]);
  });

  it("round-trips unknown metadata and branch fields", () => {
    const snapshot: ChatSessionSnapshot = {
      session: {
        id: "session-1",
        name: "Stored",
        rootNodeId: "root",
        activeLeafId: "assistant",
        displayAgentId: null,
        messageCount: 1,
        isFavorite: true,
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:01.000Z",
      },
      messages: [
        {
          id: "assistant",
          sessionId: "session-1",
          parentId: "root",
          siblingOrder: 0,
          lastSelectedChildId: null,
          role: "assistant",
          type: "custom-message",
          content: "answer",
          status: "complete",
          timestamp: "2026-07-21T00:00:01.000Z",
          metadata: {
            modelId: "model-1",
            reasoningContent: "thinking",
            futureField: { preserved: true },
          },
        },
        {
          id: "root",
          sessionId: "session-1",
          parentId: null,
          siblingOrder: 0,
          lastSelectedChildId: "assistant",
          role: "system",
          type: "message",
          content: "",
          status: "complete",
          timestamp: "2026-07-21T00:00:00.000Z",
          metadata: {},
        },
      ],
      attachments: [],
    };

    const decoded = decodeChatSessionSnapshot(snapshot);
    expect(decoded.nodes.assistant.metadata).toEqual(
      snapshot.messages[0].metadata
    );
    expect(decoded.nodes.root.childrenIds).toEqual(["assistant"]);
    expect(decoded.nodes.root.lastSelectedChildId).toBe("assistant");
    expect(decoded.isFavorite).toBe(true);
  });

  it("encodes attachment refs separately from message metadata", () => {
    const current = session({
      root: node("root", null, "", ["user"]),
      user: {
        ...node("user", "root", "with file"),
        attachments: [
          {
            id: "attachment-1",
            assetId: "asset-1",
            usagePolicy: "advisory",
            snapshot: {
              displayName: "photo.png",
              kind: "image",
              mimeType: "image/png",
              sizeBytes: 1024,
            },
          },
        ],
      },
    });
    current.activeLeafId = "user";

    const changes = buildPersistChatChanges(current);
    expect(changes.upsertMessages[1]).not.toHaveProperty("attachments");
    expect(changes.upsertAttachments).toEqual([
      expect.objectContaining({
        id: "attachment-1",
        messageId: "user",
        assetId: "asset-1",
        usagePolicy: "advisory",
      }),
    ]);
  });

  it("rejects unreachable nodes instead of silently dropping them", () => {
    const current = session({
      root: node("root", null, "", []),
      orphan: node("orphan", "root", "orphan"),
    });
    current.activeLeafId = "root";

    expect(() => chatSessionToMessageInputs(current)).toThrow("unreachable");
  });

  it("recovers persisted generating messages as explicit errors", () => {
    const current = session({
      root: node("root", null, "", ["assistant-1", "assistant-2"]),
      "assistant-1": {
        ...node("assistant-1", "root", "partial"),
        role: "assistant",
        status: "generating",
        metadata: { modelId: "model-1" },
      },
      "assistant-2": {
        ...node("assistant-2", "root", "complete"),
        role: "assistant",
      },
    });

    expect(
      recoverInterruptedChatMessages(current, "2026-07-22T00:00:00.000Z")
    ).toBe(1);
    expect(current.nodes["assistant-1"]).toMatchObject({
      status: "error",
      metadata: {
        modelId: "model-1",
        error: "Generation was interrupted when the application stopped.",
      },
    });
    expect(current.nodes["assistant-2"].status).toBe("complete");
    expect(current.updatedAt).toBe("2026-07-22T00:00:00.000Z");
  });
});
