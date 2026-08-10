import { describe, expect, it } from "vitest";
import type { ChatMessageNode } from "../../types";
import {
  getMessageStatusPresentation,
  resolveMessageDisplayStatus,
} from "../messageStatus";

function createMessage(
  overrides: Partial<ChatMessageNode> = {}
): ChatMessageNode {
  return {
    id: "message-1",
    parentId: null,
    childrenIds: [],
    content: "",
    role: "assistant",
    status: "complete",
    ...overrides,
  };
}

describe("messageStatus", () => {
  it.each([
    ["generating", "生成中"],
    ["waiting", "等待"],
    ["queued", "排队"],
    ["error", "错误"],
  ] as const)("maps %s to the expected label", (status, label) => {
    const presentation = getMessageStatusPresentation(
      createMessage({ status })
    );

    expect(presentation).toMatchObject({ status, label });
  });

  it("keeps normal completed messages without a display status", () => {
    expect(resolveMessageDisplayStatus(createMessage())).toBeNull();
  });

  it("recognizes legacy pending and isQueued messages as queued", () => {
    expect(
      resolveMessageDisplayStatus(
        createMessage({ status: "complete", metadata: { isQueued: true } })
      )
    ).toBe("queued");

    expect(
      resolveMessageDisplayStatus(
        createMessage({ status: "pending" as ChatMessageNode["status"] })
      )
    ).toBe("queued");
  });

  it("recognizes pending tool approval as waiting", () => {
    expect(
      resolveMessageDisplayStatus(
        createMessage({
          role: "tool",
          status: "generating",
          metadata: {
            toolCalls: [
              {
                requestId: "request-1",
                toolName: "demo",
                status: "awaiting_approval",
              },
            ],
          },
        })
      )
    ).toBe("waiting");
  });

  it("recognizes an empty-response diagnostic as abnormal", () => {
    const presentation = getMessageStatusPresentation(
      createMessage({
        metadata: {
          emptyResponseDiagnostic: "没有检测到可展示的正文",
        },
      })
    );

    expect(presentation).toMatchObject({
      status: "abnormal",
      label: "异常回复",
      detail: "没有检测到可展示的正文",
    });
  });
});
