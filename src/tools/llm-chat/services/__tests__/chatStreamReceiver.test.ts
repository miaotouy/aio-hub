// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import {
  ChatStreamReceiver,
  type ChatStreamingDelta,
} from "../chatStreamReceiver";
import type { ChatMessageNode, ChatSessionDetail } from "../../types";
function node(
  content = "",
  role: ChatMessageNode["role"] = "assistant"
): ChatMessageNode {
  return {
    id: "node",
    role,
    content,
    parentId: null,
    childrenIds: [],
    status: "generating",
    metadata: { requestStartTime: 10 },
  } as ChatMessageNode;
}
function detail(n?: ChatMessageNode): ChatSessionDetail {
  return {
    id: "session",
    nodes: n ? { node: n } : {},
    activeLeafId: "node",
    rootNodeId: "node",
    updatedAt: "",
    history: [],
    historyIndex: -1,
  };
}
function host() {
  const sessions = new Map<string, ChatSessionDetail>();
  const onContent = vi.fn(),
    onComplete = vi.fn(),
    requestSnapshot = vi.fn();
  const receiver = new ChatStreamReceiver({
    sessions,
    onContent,
    onComplete,
    requestSnapshot,
  });
  const send = (
    delta: string,
    offset: number,
    extra: Partial<ChatStreamingDelta> = {}
  ) =>
    receiver.receive({
      sessionId: "session",
      nodeId: "node",
      isReasoning: false,
      requestStartTime: 10,
      delta,
      offset,
      ...extra,
    });
  return { sessions, receiver, send, onContent, onComplete, requestSnapshot };
}
// Absolute ranges protect mixed snapshot/delta arrival from duplicated or regressing visible text.
it("merges overlaps and stale checkpoints without changing the received snapshot", () => {
  const h = host();
  const incoming = detail(node("A"));
  h.receiver.snapshot(incoming);
  h.send("BC", 1);
  h.send("BCD", 1);
  expect(h.sessions.get("session")!.nodes.node.content).toBe("ABCD");
  expect(incoming.nodes.node.content).toBe("A");
  h.receiver.snapshot(detail(node("AB")));
  expect(h.sessions.get("session")!.nodes.node.content).toBe("ABCD");
  h.send("CD", 2);
  expect(h.onContent.mock.calls.map((call) => call[2])).toEqual(["BC", "D"]);
});
it("stages a new tool node and displays contiguous ranges as soon as its snapshot arrives", () => {
  const h = host();
  h.send("first", 0);
  h.send(" result", 5);
  expect(h.requestSnapshot).toHaveBeenCalled();
  const result = h.receiver.snapshot(detail(node("", "tool")));
  expect(result.nodes.node.content).toBe("first result");
  expect(h.onContent).not.toHaveBeenCalled();
});
it("keeps reasoning and body independent and makes final snapshots authoritative", () => {
  const h = host();
  h.receiver.snapshot(detail(node()));
  h.send("thinking", 0, { isReasoning: true });
  h.send("body", 0);
  expect(h.sessions.get("session")!.nodes.node.metadata).toMatchObject({
    reasoningContent: "thinking",
    reasoningActive: false,
  });
  const final = node("converted");
  final.status = "complete";
  h.receiver.snapshot(detail(final));
  h.send("late", 4);
  expect(h.sessions.get("session")!.nodes.node.content).toBe("converted");
  expect(h.onComplete).toHaveBeenCalledTimes(1);
  h.receiver.snapshot(
    detail({ ...node(), metadata: { requestStartTime: 20 } })
  );
  h.send("old request", 0);
  expect(h.sessions.get("session")!.nodes.node.content).toBe("");
});
