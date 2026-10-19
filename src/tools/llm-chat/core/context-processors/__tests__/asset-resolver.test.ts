import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { PipelineContext } from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import type { PipelineAttachment } from "../../../types/pipeline-attachment";
import { DEFAULT_SETTINGS } from "../../../config/defaultSettings";
import { assetResolver } from "../asset-resolver";
import { getAttachmentBuffer } from "../../context-utils/attachment-binary";

// 隔离转写设置的 UI 依赖，保留真实请求默认值。
vi.mock("@/tools/transcription/config", () => ({
  DEFAULT_TRANSCRIPTION_CONFIG: {},
}));
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
const mediaCases = [
  { type: "image", mimeType: "image/png", label: "[图片]", content: image },
  {
    type: "audio",
    mimeType: "audio/wav",
    label: "[音频]",
    content: {
      type: "audio",
      source: { type: "base64", media_type: "audio/wav", data: "image-data" },
    },
  },
  {
    type: "video",
    mimeType: "video/mp4",
    label: "[视频]",
    content: {
      type: "video",
      source: { type: "base64", media_type: "video/mp4", data: "image-data" },
    },
  },
  {
    type: "document",
    mimeType: "application/msword",
    label: "[文档]",
    content: {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/msword",
        data: "image-data",
      },
    },
  },
] satisfies {
  type: PipelineAttachment["type"];
  mimeType: string;
  label: string;
  content: LlmMessageContent;
}[];

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

describe("asset resolver media-only request compatibility", () => {
  beforeEach(() => {
    vi.mocked(getAttachmentBuffer)
      .mockReset()
      .mockResolvedValue(new ArrayBuffer(1));
  });

  it.each(mediaCases)(
    "adds text by default after resolving $type attachments",
    async ({ type, mimeType, label, content }) => {
      const ctx = context([
        {
          role: "user",
          content: "  ",
          _attachments: [{ ...attachment, type, mimeType }],
        },
      ]);
      await assetResolver.execute(ctx);
      expect(ctx.messages[0].content).toEqual([
        { type: "text", text: label },
        content,
      ]);
    }
  );

  it.each(mediaCases)(
    "keeps $type-only requests unchanged when disabled",
    async ({ type, mimeType, content }) => {
      const ctx = context(
        [
          {
            role: "user",
            content: "",
            _attachments: [{ ...attachment, type, mimeType }],
          },
        ],
        false
      );
      await assetResolver.execute(ctx);
      expect(ctx.messages[0].content).toEqual([content]);
    }
  );

  it("handles structured mixed media without mutating the source or duplicating text and labels", async () => {
    const media = [...mediaCases.map(({ content }) => content), image];
    const original = [{ type: "text" as const, text: " \n " }, ...media];
    const ctx = context([{ role: "user", content: original }]);
    await assetResolver.execute(ctx);
    const result = structuredClone(ctx.messages[0].content);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual(result);
    expect(ctx.messages[0].content).toEqual([
      { type: "text", text: "[图片] [音频] [视频] [文档]" },
      ...media,
    ]);
    expect(original).toEqual([{ type: "text", text: " \n " }, ...media]);
  });

  it("preserves body/transcription text, other roles and empty messages", async () => {
    const media = mediaCases.map(({ content }) => content);
    const messages: ProcessableMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "正文或转写" }, ...media],
      },
      { role: "assistant", content: media },
      { role: "system", content: media },
      { role: "user", content: "" },
    ];
    const before = structuredClone(messages);
    await assetResolver.execute(context(messages));
    expect(messages).toEqual(before);
  });

  it("reports a missing local media file in model context", async () => {
    vi.mocked(getAttachmentBuffer).mockRejectedValueOnce(
      new Error("文件已移动或删除")
    );
    const ctx = context([
      {
        role: "user",
        content: "读取媒体成功",
        _attachments: [
          {
            ...attachment,
            source: { kind: "local-file", path: "C:/media/photo.png" },
          },
        ],
      },
    ]);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toContainEqual({
      type: "text",
      text: expect.stringContaining("文件已移动或删除"),
    });
    expect(ctx.logs[0].level).toBe("warn");
  });

  it("does not fabricate text when all attachments fail to resolve", async () => {
    vi.mocked(getAttachmentBuffer).mockRejectedValue(new Error("unavailable"));
    const ctx = context([
      {
        role: "user",
        content: "",
        _attachments: mediaCases.map(({ type, mimeType }) => ({
          ...attachment,
          type,
          mimeType,
        })),
      },
    ]);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual([]);
  });

  it("uses only successfully resolved media for placeholder labels", async () => {
    vi.mocked(getAttachmentBuffer).mockRejectedValueOnce(
      new Error("unavailable")
    );
    const audio = mediaCases[1];
    const ctx = context([
      {
        role: "user",
        content: "",
        _attachments: [
          attachment,
          { ...attachment, type: audio.type, mimeType: audio.mimeType },
        ],
      },
    ]);
    await assetResolver.execute(ctx);
    expect(ctx.messages[0].content).toEqual([
      { type: "text", text: "[音频]" },
      audio.content,
    ]);
  });

  it.each([false, true])(
    "uses the final PDF format when native document support is %s",
    async (document) => {
      const ctx = context([
        {
          role: "user",
          content: "",
          _attachments: [
            { ...attachment, type: "document", mimeType: "application/pdf" },
          ],
        },
      ]);
      await assetResolver.execute({
        ...ctx,
        capabilities: { vision: true, document },
      });
      expect(ctx.messages[0].content).toEqual(
        document
          ? [
              { type: "text", text: "[文档]" },
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: "image-data",
                },
              },
            ]
          : [
              { type: "text", text: "[图片]" },
              { type: "image", imageBase64: "pdf-page" },
            ]
      );
    }
  );
});
