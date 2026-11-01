import { describe, expect, it, vi } from "vitest";
import {
  cloneVirtualAttachments,
  formatVirtualTextAttachment,
  normalizeVirtualAttachments,
  textCharacterCount,
} from "../virtualAttachments";
import { fromVirtualTextAttachment } from "../../types/pipeline-attachment";
import type { PipelineContext } from "../../types/pipeline";

vi.mock("../../core/context-utils/attachment-resolver", () => ({
  getTranscriptionAsset: vi.fn(),
  resolveAttachmentsBatch: vi.fn(async () => []),
}));
vi.mock("../../core/context-utils/zip-document-image-splitter", () => ({
  splitZipDocumentIntoImageAssets: vi.fn(),
}));
vi.mock("@/utils/docxParser", () => ({ isDocxAssetLike: () => false }));
vi.mock("@/utils/zipDocumentParser", () => ({
  isPptxAssetLike: () => false,
  isXlsxAssetLike: () => false,
}));
vi.mock("../../composables/features/useTranscriptionManager", () => ({
  useTranscriptionManager: vi.fn(),
}));
import { transcriptionProcessor } from "../../core/context-processors/transcription-processor";
import { resolveAttachmentsBatch } from "../../core/context-utils/attachment-resolver";

const attachment = {
  id: "text",
  kind: "text" as const,
  title: "代码\n[材料]",
  text: "  {{literal}}\r\n```js\n😀\n```\n  ",
};

describe("message-owned text materials", () => {
  it("preserves imported source text and creates independent copies with new identities", () => {
    const imported = normalizeVirtualAttachments([attachment]);
    const copied = cloneVirtualAttachments(imported, true);
    expect(imported[0].text).toBe(attachment.text);
    expect(copied[0].id).not.toBe(attachment.id);
    copied[0].text = "changed";
    expect(imported[0].text).toBe(attachment.text);
    expect(textCharacterCount("中😀a")).toBe(3);
    expect(() =>
      normalizeVirtualAttachments([{ ...attachment, text: 123 }])
    ).toThrow();
  });

  it.each([false, true])(
    "includes full material once with transcription enabled=%s",
    async (enabled) => {
      const context = {
        messages: [
          {
            role: "user",
            content: "问题",
            _attachments: [fromVirtualTextAttachment(attachment)],
          },
        ],
        agentConfig: { modelId: "model", profileId: "profile" },
        sharedData: new Map([["transcriptionConfig", { enabled }]]),
        logs: [],
      } as unknown as PipelineContext;
      await transcriptionProcessor.execute(context);
      const expected = "问题" + formatVirtualTextAttachment(attachment);
      expect(context.messages[0].content).toBe(expected);
      expect(expected).toContain("````\n" + attachment.text + "\n````");
      await transcriptionProcessor.execute(context);
      expect(context.messages[0].content).toBe(expected);
      expect(resolveAttachmentsBatch).not.toHaveBeenCalled();
    }
  );
  // A converted file link inside a material must resolve in place and claim its transcription once.
  it("resolves file references inside materials without appending duplicate file text", async () => {
    const file = {
      id: "linked-file",
      type: "document" as const,
      name: "notes.txt",
      mimeType: "text/plain",
      source: { kind: "asset-library" as const, path: "texts/notes.txt" },
    };
    const material = { ...attachment, text: "引用：【file::linked-file】" };
    const fileText = "\n[文件: notes.txt]\n```\n文件全文\n```\n";
    vi.mocked(resolveAttachmentsBatch).mockResolvedValueOnce([
      { type: "text", content: fileText, asset: file },
    ]);
    const context = {
      messages: [
        {
          role: "user",
          content: "问题",
          _attachments: [fromVirtualTextAttachment(material), file],
        },
      ],
      agentConfig: { modelId: "model", profileId: "profile" },
      sharedData: new Map([["transcriptionConfig", { enabled: true }]]),
      logs: [],
    } as unknown as PipelineContext;
    await transcriptionProcessor.execute(context);
    expect(context.messages[0].content).toBe(
      "问题" +
        formatVirtualTextAttachment({ ...material, text: "引用：" + fileText })
    );
    expect(context.messages[0]._attachments).toEqual([]);
    await transcriptionProcessor.execute(context);
    expect(context.messages[0].content).toBe(
      "问题" +
        formatVirtualTextAttachment({ ...material, text: "引用：" + fileText })
    );
    vi.mocked(resolveAttachmentsBatch).mockClear();
  });
});
