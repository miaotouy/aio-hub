import { describe, expect, it } from "vitest";
import type { ChatMessageNode } from "../../types";
import { projectMessagePresentation } from "../messagePresentation";
function node(
  id: string,
  role: ChatMessageNode["role"],
  parentId: string | null,
  metadata?: ChatMessageNode["metadata"]
): ChatMessageNode {
  return {
    id,
    role,
    parentId,
    metadata,
    childrenIds: [],
    content: id,
    status: "complete",
  };
}
function conversation() {
  return [
    node("u", "user", null),
    node("a", "assistant", "u", {
      agentId: "agent",
      toolCallsRequested: [
        { requestId: "call", toolName: "read", args: {}, status: "completed" },
      ],
    }),
    node("t", "tool", "a", {
      toolCall: { requestId: "call", toolName: "read", status: "success" },
    }),
    node("b", "assistant", "t", { agentId: "agent" }),
    node("u2", "user", "b"),
  ];
}
describe("message presentation", () => {
  it("shares assistant identity across owned tool loops, preserving all source nodes and question ranges", () => {
    const messages = conversation();
    const p = projectMessagePresentation(messages, true);
    expect(p.groups.map((g) => g.members.map((m) => m.id))).toEqual([
      ["u"],
      ["a", "t", "b"],
      ["u2"],
    ]);
    expect(
      p.navigationPoints.map((n) => [n.anchorNodeId, n.endNodeId])
    ).toEqual([
      ["u", "b"],
      ["u2", "u2"],
    ]);
    expect(p.navigationByNodeId.get("t")).toBe(0);
    expect(p.groups[1].members[1]).toBe(messages[2]);
    const normal = projectMessagePresentation(messages, false);
    expect(normal.groups).toHaveLength(messages.length);
    expect(normal.navigationPoints.map((n) => n.id)).toEqual([
      "u",
      "a",
      "b",
      "u2",
    ]);
  });
  it("splits on actor/model changes and unowned tools while keeping one question navigation range", () => {
    const messages = conversation();
    messages[3].metadata = { agentId: "other", modelId: "new" };
    expect(
      projectMessagePresentation(messages, true).groups.map(
        (g) => g.members.length
      )
    ).toEqual([1, 2, 1, 1]);
    messages[2].metadata!.toolCall!.requestId = "unrelated";
    expect(
      projectMessagePresentation(messages, true).groups.map(
        (g) => g.members.length
      )
    ).toEqual([1, 1, 1, 1, 1]);
    expect(
      projectMessagePresentation(messages, true).navigationPoints
    ).toHaveLength(2);
  });
  it("keeps knowledge-reference tools and injected user-role messages separate from human questions", () => {
    const messages = conversation();
    messages[2].metadata!.knowledgeReferenceUserMessageId = "u";
    messages.splice(
      4,
      0,
      node("event", "user", "b", {
        origin: { kind: "agent", channel: "background_task", taskId: "job" },
      })
    );
    const p = projectMessagePresentation(messages, true);
    expect(p.groups.find((g) => g.id === "t")!.members).toHaveLength(1);
    expect(p.navigationPoints.map((n) => n.id)).toEqual(["u", "u2"]);
  });
  it("reprojects clipped screenshots and updates the former tail when a reply is appended", () => {
    const messages = conversation().slice(0, 3);
    const before = projectMessagePresentation(messages, true);
    messages.push(node("b", "assistant", "t", { agentId: "agent" }));
    const after = projectMessagePresentation(messages, true);
    expect(after.rows.get("t")!.last).toBe(false);
    expect(after.rows.get("t")!.layoutKey).not.toBe(
      before.rows.get("t")!.layoutKey
    );
    const clipped = projectMessagePresentation(messages.slice(3), true);
    expect(clipped.rows.get("b")!.first).toBe(true);
    expect(clipped.groups[0].actor.id).toBe("b");
  });
  it("merges consecutive human messages into one question point only when visibly grouped", () => {
    const messages = [
      node("u", "user", null),
      node("u2", "user", "u"),
      node("a", "assistant", "u2"),
    ];
    const p = projectMessagePresentation(messages, true);
    expect(p.groups[0].members).toHaveLength(2);
    expect(p.navigationPoints.map((n) => n.anchorNodeId)).toEqual(["u"]);
    expect(p.navigationByNodeId.get("u2")).toBe(0);
  });
});

it("the shared identity follows active members, and its cached geometry changes when activity settles", () => {
  const messages = conversation();
  messages[3].status = "generating";
  const live = projectMessagePresentation(messages, true);
  expect(live.groups[1].actor.id).toBe("a");
  expect(live.groups[1].activityNode?.id).toBe("b");
  messages[3].status = "complete";
  const settled = projectMessagePresentation(messages, true);
  expect(settled.groups[1].activityNode).toBeUndefined();
  expect(settled.rows.get("a")!.layoutKey).not.toBe(
    live.rows.get("a")!.layoutKey
  );
});
