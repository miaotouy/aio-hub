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
  assets: ChatAgent["assets"] = [],
  capabilities?: PipelineContext["capabilities"]
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
    capabilities,
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

  it("inlines private audio into the request and keeps description when capability is off", async () => {
    storage.readAgentAsset.mockResolvedValue(new Uint8Array([0x01, 0x02]));
    const assets = [
      {
        id: "bgm",
        filename: "theme.mp3",
        path: "assets/theme.mp3",
        type: "audio" as const,
        mimeType: "audio/mpeg",
      },
    ];
    const message = {
      role: "user" as const,
      content: "听这段",
      sourceType: "agent_preset" as const,
      sourceId: "preset-3",
      _privateAttachments: [{ assetId: "bgm" }],
    };

    const inlinedContext = context([{ ...message }], assets, { audio: true });
    const inlined = await presetAttachmentProcessor.execute(inlinedContext);

    const inlinedContent = inlinedContext.messages[0].content;
    expect(Array.isArray(inlinedContent)).toBe(true);
    expect(inlinedContent).toEqual([
      { type: "text", text: "听这段" },
      expect.objectContaining({
        type: "audio",
        mimeType: "audio/mpeg",
        source: expect.objectContaining({ type: "base64" }),
      }),
    ]);
    expect(
      inlinedContext.sharedData.get("presetAttachmentResolutionStats")
    ).toMatchObject({ audioCount: 1, degradedCount: 0 });
    expect(inlined.status).toBe("applied");

    const degradedContext = context([{ ...message }], assets, {
      audio: false,
    });
    const degraded = await presetAttachmentProcessor.execute(degradedContext);

    const degradedContent = degradedContext.messages[0].content;
    expect(Array.isArray(degradedContent)).toBe(true);
    expect(degradedContent).toHaveLength(2);
    expect(degradedContent![1]).toMatchObject({ type: "text" });
    expect(
      (degradedContent![1] as { text: string }).text
    ).toContain("音频附件");
    expect(
      degradedContext.sharedData.get("presetAttachmentResolutionStats")
    ).toMatchObject({ audioCount: 0, degradedCount: 1 });
    expect(degraded.status).toBe("degraded");
  });

  it("inlines private video when capability allows", async () => {
    storage.readAgentAsset.mockResolvedValue(new Uint8Array([0x03, 0x04]));
    const pipelineContext = context(
      [
        {
          role: "user",
          content: "看这段",
          sourceType: "agent_preset",
          sourceId: "preset-4",
          _privateAttachments: [{ assetId: "clip" }],
        },
      ],
      [
        {
          id: "clip",
          filename: "intro.mp4",
          path: "assets/intro.mp4",
          type: "video",
          mimeType: "video/mp4",
        },
      ],
      { video: true }
    );

    const result = await presetAttachmentProcessor.execute(pipelineContext);

    const content = pipelineContext.messages[0].content;
    expect(content).toEqual([
      { type: "text", text: "看这段" },
      expect.objectContaining({
        type: "video",
        mimeType: "video/mp4",
        source: expect.objectContaining({ type: "base64" }),
      }),
    ]);
    expect(
      pipelineContext.sharedData.get("presetAttachmentResolutionStats")
    ).toMatchObject({ videoCount: 1, degradedCount: 0 });
    expect(result.status).toBe("applied");
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
