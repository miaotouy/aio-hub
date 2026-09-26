import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type { PipelineContext } from "@/tools/llm-chat/types";

const storage = vi.hoisted(() => ({ readAgentAsset: vi.fn() }));

vi.mock("@/tools/agent-manager/composables/useAgentStorage", () => ({
  useAgentStorage: () => storage,
}));

import { presetAttachmentProcessor } from "../preset-attachment-processor";

function context(
  messages: PipelineContext["messages"],
  assets: ChatAgent["assets"] = []
): PipelineContext {
  return {
    messages,
    session: {} as PipelineContext["session"],
    agentConfig: {
      id: "agent-1",
      name: "Agent",
      profileId: "profile-1",
      modelId: "model-1",
      createdAt: "2026-07-26T00:00:00.000Z",
      assets,
    },
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    sharedData: new Map(),
    logs: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("presetAttachmentProcessor", () => {
  it("inlines private image bytes into vision content", async () => {
    storage.readAgentAsset.mockResolvedValue(
      new Uint8Array([137, 80, 78, 71])
    );
    const pipelineContext = context(
      [
        {
          role: "system",
          content: "请看图",
          sourceType: "agent_preset",
          sourceId: "preset-1",
          _privateAttachments: [{ assetId: "pic" }],
        },
      ],
      [
        {
          id: "pic",
          filename: "pic.png",
          path: "assets/pic.png",
          type: "image",
          mimeType: "image/png",
        },
      ]
    );

    const result = await presetAttachmentProcessor.execute(pipelineContext);

    expect(storage.readAgentAsset).toHaveBeenCalledWith(
      "agent-1",
      "assets/pic.png"
    );
    const content = pipelineContext.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toEqual([
      { type: "text", text: "请看图" },
      expect.objectContaining({
        type: "image",
        mimeType: "image/png",
        source: expect.objectContaining({ type: "base64" }),
      }),
    ]);
    expect(pipelineContext.messages[0]._privateAttachments).toBeUndefined();
    expect(result.status).toBe("applied");
  });

  it("falls back to inline text for document attachments", async () => {
    storage.readAgentAsset.mockResolvedValue(
      new TextEncoder().encode("世界书摘要")
    );
    const pipelineContext = context(
      [
        {
          role: "user",
          content: "",
          sourceType: "agent_preset",
          sourceId: "preset-2",
          _privateAttachments: [{ assetId: "doc" }],
        },
      ],
      [
        {
          id: "doc",
          filename: "lore.txt",
          path: "assets/lore.txt",
          type: "file",
          mimeType: "text/plain",
        },
      ]
    );

    const result = await presetAttachmentProcessor.execute(pipelineContext);

    const content = pipelineContext.messages[0].content;
    expect(content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("世界书摘要"),
      }),
    ]);
    expect(result.status).toBe("applied");
  });

  it("degrades missing private assets into a warning instead of dropping silently", async () => {
    storage.readAgentAsset.mockResolvedValue(null);
    const pipelineContext = context([
      {
        role: "user",
        content: "keep me",
        sourceType: "session_history",
        sourceId: "node-1",
        _privateAttachments: [{ path: "assets/gone.png" }],
      },
    ]);

    const result = await presetAttachmentProcessor.execute(pipelineContext);

    expect(result.status).toBe("degraded");
    expect(
      pipelineContext.sharedData.get("presetAttachmentResolutionStats")
    ).toMatchObject({ missingCount: 1 });
    expect(pipelineContext.messages[0].content).toBe("keep me");
    expect(pipelineContext.messages[0]._privateAttachments).toBeUndefined();
  });

  it("leaves messages untouched when no private attachments exist", async () => {
    const message = {
      role: "user" as const,
      content: "plain",
      sourceType: "session_history" as const,
      sourceId: "node-1",
    };
    const pipelineContext = context([{ ...message }]);

    const result = await presetAttachmentProcessor.execute(pipelineContext);

    expect(result.status).toBe("skipped");
    expect(storage.readAgentAsset).not.toHaveBeenCalled();
    expect(pipelineContext.messages[0]).toEqual(message);
  });
});
