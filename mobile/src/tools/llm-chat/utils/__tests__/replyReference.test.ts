import { describe, expect, it } from "vitest";
import type { ChatMessageNode } from "../../types";
import {
  createReplyReference,
  formatReplyReferenceContent,
  isChatMessageReference,
} from "../replyReference";

const message: ChatMessageNode = {
  id: "assistant-1",
  parentId: "user-1",
  childrenIds: [],
  role: "assistant",
  status: "complete",
  content: "Original answer",
  timestamp: "2026-07-26T10:00:00.000Z",
};

describe("reply references", () => {
  it("creates a durable message snapshot and formats it for model context", () => {
    const reference = createReplyReference(message);
    message.content = "Edited answer";

    expect(reference).toEqual({
      messageId: "assistant-1",
      role: "assistant",
      content: "Original answer",
      timestamp: "2026-07-26T10:00:00.000Z",
    });
    expect(formatReplyReferenceContent(reference, "Follow-up")).toBe(
      '<reply_to role="assistant">\nOriginal answer\n</reply_to>\n\nFollow-up'
    );
  });

  it("only accepts complete reply reference metadata", () => {
    expect(
      isChatMessageReference({ messageId: "a", role: "user", content: "x" })
    ).toBe(true);
    expect(
      isChatMessageReference({ messageId: "a", role: "tool", content: "x" })
    ).toBe(false);
    expect(isChatMessageReference({ messageId: "a", role: "user" })).toBe(
      false
    );
  });
});
