import { describe, expect, it } from "vitest";
import type { ChatMessageNode, ChatSessionDetail } from "../../types";
import { removeLiveGreetings } from "../greetingService";

function message(
  id: string,
  parentId: string | null,
  greetingLive?: boolean
): ChatMessageNode {
  return {
    id,
    parentId,
    childrenIds: [],
    content: id,
    role: parentId ? "assistant" : "system",
    status: "complete",
    isEnabled: true,
    timestamp: "2026-09-21T00:00:00.000Z",
    metadata:
      greetingLive === undefined
        ? undefined
        : { isGreeting: true, greetingLive },
  };
}

describe("removeLiveGreetings", () => {
  it("删除仍可变的开场并保留已固化的历史开场", () => {
    const root = message("root", null);
    const live = message("live", root.id, true);
    const solidified = message("solidified", root.id, false);
    root.childrenIds = [live.id, solidified.id];
    root.lastSelectedChildId = live.id;

    const session: ChatSessionDetail = {
      id: "draft",
      updatedAt: "2026-09-21T00:00:00.000Z",
      nodes: {
        [root.id]: root,
        [live.id]: live,
        [solidified.id]: solidified,
      },
      rootNodeId: root.id,
      activeLeafId: live.id,
      history: [],
      historyIndex: -1,
    };

    expect(removeLiveGreetings(session)).toBe(true);
    expect(session.nodes[live.id]).toBeUndefined();
    expect(session.nodes[solidified.id]).toBe(solidified);
    expect(root.childrenIds).toEqual([solidified.id]);
    expect(root.lastSelectedChildId).toBeUndefined();
    expect(session.activeLeafId).toBe(root.id);
  });
});
