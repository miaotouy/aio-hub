import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import type { PipelineAttachment } from "../../../types/pipeline-attachment";
import { DEFAULT_SETTINGS } from "../../../config/defaultSettings";
import { assetResolver } from "../asset-resolver";
import { getAttachmentBuffer } from "../../context-utils/attachment-binary";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
vi.mock("../../context-utils/attachment-binary", () => ({
  getAttachmentBuffer: vi.fn(),
}));
vi.mock("@/utils/base64", () => ({
  convertArrayBufferToBase64: vi.fn(async () => "image-data"),
}));
vi.mock("@/utils/pdfUtils", () => ({
  convertPdfToImages: vi.fn(async () => [{ base64: "pdf-page" }]),
}));
vi.mock("@/utils/imageProcessor", () => ({
  getImageDimensions: vi.fn(async () => ({ width: 10, height: 10 })),
  resizeImage: vi.fn(),
}));

const image = { type: "image" as const, imageBase64: "image-data" };
const attachment: PipelineAttachment = {
  id: "image",
  type: "image",
  name: "image.png",
  mimeType: "image/png",
  source: { kind: "inline", base64: "image-data", mimeType: "image/png" },
};
function context(
  messages: ProcessableMessage[],
  enabled = DEFAULT_SETTINGS.requestSettings.imageOnlyMessagePlaceholder
): PipelineContext {
  return {
    messages,
    settings: {
      ...DEFAULT_SETTINGS,
      requestSettings: {
        ...DEFAULT_SETTINGS.requestSettings,
        imageOnlyMessagePlaceholder: enabled,
      },
    },
    agentConfig: {
      id: "test",
      name: "test",
      profileId: "test",
      modelId: "test",
      createdAt: "2026-09-07",
    },
    index: {
      id: "test",
      name: "test",
      messageCount: 0,
      createdAt: "2026-09-07",
      updatedAt: "2026-09-07",
    },
    detail: {
      id: "test",
      updatedAt: "2026-09-07",
      nodes: {},
      rootNodeId: "root",
      activeLeafId: "root",
      history: [],
      historyIndex: -1,
    },
    capabilities: { vision: true },
    timestamp: 0,
    sharedData: new Map(),
    logs: [],
  };
}

describe("asset resolver image-only request compatibility", () => {
  beforeEach(() => {
    vi.mocked(getAttachmentBuffer)
      .mockReset()
      .mockResolvedValue(new ArrayBuffer(1));
  });

  it("adds non-empty text by default after resolving image attachments", async () => {
    const ctx = context([
      { role: "user", content: "  ", _attachments: [attachment] },
    ]);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual([
      { type: "text", text: expect.stringMatching(/\S/) },
      image,
    ]);
  });

  it("keeps image-only requests unchanged when disabled", async () => {
    const ctx = context(
      [{ role: "user", content: "", _attachments: [attachment] }],
      false
    );
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual([image]);
  });

  it("handles structured images without mutating the original content or duplicating text", async () => {
    const original = [{ type: "text" as const, text: " \n " }, image, image];
    const ctx = context([{ role: "user", content: original }]);
    await assetResolver.execute(ctx);
    const result = structuredClone(ctx.messages[0].content);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual(result);
    expect(ctx.messages[0].content).toEqual([
      { type: "text", text: expect.stringMatching(/\S/) },
      image,
      image,
    ]);
    expect(original).toEqual([{ type: "text", text: " \n " }, image, image]);
  });

  it("preserves body/transcription text and excludes other roles, empty messages and mixed media", async () => {
    const messages: ProcessableMessage[] = [
      { role: "user", content: [{ type: "text", text: "正文或转写" }, image] },
      { role: "assistant", content: [image] },
      { role: "system", content: [image] },
      { role: "user", content: "" },
      {
        role: "user",
        content: [
          image,
          {
            type: "audio",
            source: { type: "base64", media_type: "audio/wav", data: "audio" },
          },
        ],
      },
    ];
    const before = structuredClone(messages);
    await assetResolver.execute(context(messages));
    expect(messages).toEqual(before);
  });

  it("does not fabricate text when all images fail to resolve", async () => {
    vi.mocked(getAttachmentBuffer).mockRejectedValue(new Error("unavailable"));
    const ctx = context([
      { role: "user", content: "", _attachments: [attachment] },
    ]);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual([]);
  });

  it("also protects a PDF resolved as images for a vision model", async () => {
    const ctx = context([
      {
        role: "user",
        content: "",
        _attachments: [
          { ...attachment, type: "document", mimeType: "application/pdf" },
        ],
      },
    ]);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual([
      { type: "text", text: expect.stringMatching(/\S/) },
      { type: "image", imageBase64: "pdf-page" },
    ]);
  });
});
