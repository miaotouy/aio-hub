import { describe, expect, it } from "vitest";
import type { PipelineContext } from "@/tools/llm-chat/types";
import { sessionLoader } from "../session-loader";

function context(): PipelineContext {
  return {
    messages: [],
    session: {
      id: "session-1",
      name: "Reply test",
      nodes: {
        root: {
          id: "root",
          parentId: null,
          childrenIds: ["assistant-1"],
          role: "system",
          status: "complete",
          content: "",
        },
        "assistant-1": {
          id: "assistant-1",
          parentId: "root",
          childrenIds: ["user-2"],
          role: "assistant",
          status: "complete",
          content: "Original answer",
        },
        "user-2": {
          id: "user-2",
          parentId: "assistant-1",
          childrenIds: [],
          role: "user",
          status: "complete",
          content: "Follow-up",
          metadata: {
            replyTo: {
              messageId: "assistant-1",
              role: "assistant",
              content: "Original answer",
            },
          },
        },
      },
      rootNodeId: "root",
      activeLeafId: "user-2",
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: "2026-07-26T10:00:00.000Z",
    },
    agentConfig: null,
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    sharedData: new Map(),
    logs: [],
  };
}

describe("sessionLoader reply references", () => {
  it("keeps the display content unchanged while adding the selected target to model context", async () => {
    const pipelineContext = context();

    const result = await sessionLoader.execute(pipelineContext);

    expect(result.status).toBe("applied");
    expect(pipelineContext.messages).toEqual([
      expect.objectContaining({
        sourceId: "assistant-1",
        content: "Original answer",
      }),
      expect.objectContaining({
        sourceId: "user-2",
        content:
          '<reply_to role="assistant">\nOriginal answer\n</reply_to>\n\nFollow-up',
      }),
    ]);
  });

  it("carries greeting private attachment references into the processable message", async () => {
    const pipelineContext = context();
    pipelineContext.session.nodes["user-2"].metadata = {
      ...pipelineContext.session.nodes["user-2"].metadata,
      privateAttachments: [
        {
          id: "global-uuid",
          name: "pic.png",
          path: "assets/pic.png",
          type: "image",
          mimeType: "image/png",
        },
      ],
    };

    await sessionLoader.execute(pipelineContext);

    expect(
      pipelineContext.messages[pipelineContext.messages.length - 1]
    ).toMatchObject({
      sourceId: "user-2",
      _privateAttachments: [
        expect.objectContaining({
          path: "assets/pic.png",
          filename: "pic.png",
        }),
      ],
    });
  });

  it("keeps attachment-only greeting nodes that have no text", async () => {
    const pipelineContext = context();
    pipelineContext.session.nodes["attachment-only"] = {
      id: "attachment-only",
      parentId: "user-2",
      childrenIds: [],
      role: "assistant",
      status: "complete",
      content: "",
      metadata: {
        privateAttachments: [{ path: "assets/bg.png" }],
      },
    };
    pipelineContext.session.nodes["user-2"].childrenIds.push("attachment-only");
    pipelineContext.session.activeLeafId = "attachment-only";

    await sessionLoader.execute(pipelineContext);

    expect(
      pipelineContext.messages[pipelineContext.messages.length - 1]
    ).toMatchObject({
      sourceId: "attachment-only",
      _privateAttachments: [
        expect.objectContaining({ path: "assets/bg.png" }),
      ],
    });
  });

  it("reports failure when the required session is missing", async () => {
    const pipelineContext = context();
    Object.defineProperty(pipelineContext, "session", { value: null });

    const result = await sessionLoader.execute(pipelineContext);

    expect(result).toEqual(
      expect.objectContaining({
        status: "failed",
        message: expect.stringContaining("缺少 session"),
      })
    );
  });
});
