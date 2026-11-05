import { beforeEach, describe, expect, it, vi } from "vitest";

const assetService = vi.hoisted(() => ({
  extractAssetText: vi.fn(),
}));

vi.mock("../assetService", () => assetService);
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn(), info: vi.fn() }),
}));

import {
  MAX_TEXT_SNAPSHOT_BYTES,
  MAX_TEXT_SNAPSHOT_CHARS,
  isTextSnapshotCandidate,
  resolveAttachmentTextSnapshot,
} from "../assetTextSnapshotService";

function asset(
  overrides: Partial<{
    id: string;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
  }> = {}
) {
  return {
    id: "asset-1",
    displayName: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 128,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("text snapshot candidate detection", () => {
  it("accepts text mime types and known text extensions", () => {
    expect(isTextSnapshotCandidate(asset())).toBe(true);
    expect(
      isTextSnapshotCandidate(asset({ mimeType: "application/json" }))
    ).toBe(true);
    expect(
      isTextSnapshotCandidate(
        asset({ displayName: "data.bin", mimeType: "application/octet-stream" })
      )
    ).toBe(false);
    expect(
      isTextSnapshotCandidate(
        asset({ displayName: "report.csv", mimeType: "application/octet-stream" })
      )
    ).toBe(true);
  });

  it("rejects compressed office documents", () => {
    expect(
      isTextSnapshotCandidate(
        asset({
          displayName: "report.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      )
    ).toBe(false);
  });
});

describe("resolveAttachmentTextSnapshot", () => {
  it("extracts text for a readable text attachment", async () => {
    assetService.extractAssetText.mockResolvedValue({
      assetId: "asset-1",
      text: "hello snapshot",
      mimeType: "text/plain",
      bytesRead: 14,
    });

    await expect(resolveAttachmentTextSnapshot(asset())).resolves.toEqual({
      text: "hello snapshot",
      truncated: false,
    });
    expect(assetService.extractAssetText).toHaveBeenCalledWith("asset-1");
  });

  it("skips non-text attachments without reading native bytes", async () => {
    const result = await resolveAttachmentTextSnapshot(
      asset({ displayName: "photo.png", mimeType: "image/png" })
    );

    expect(result).toEqual({ truncated: false });
    expect(assetService.extractAssetText).not.toHaveBeenCalled();
  });

  it("skips oversized text attachments and warns", async () => {
    const result = await resolveAttachmentTextSnapshot(
      asset({ sizeBytes: MAX_TEXT_SNAPSHOT_BYTES + 1 })
    );

    expect(result.truncated).toBe(false);
    expect(result.text).toBeUndefined();
    expect(result.warning).toContain("快照上限");
    expect(assetService.extractAssetText).not.toHaveBeenCalled();
  });

  it("truncates extracted text that exceeds the snapshot character budget", async () => {
    assetService.extractAssetText.mockResolvedValue({
      assetId: "asset-1",
      text: "a".repeat(MAX_TEXT_SNAPSHOT_CHARS + 50),
      mimeType: "text/plain",
      bytesRead: MAX_TEXT_SNAPSHOT_CHARS + 50,
    });

    const result = await resolveAttachmentTextSnapshot(asset());

    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(MAX_TEXT_SNAPSHOT_CHARS);
    expect(result.warning).toContain("截断");
  });

  it("keeps the attachment usable when native extraction fails", async () => {
    assetService.extractAssetText.mockRejectedValue(
      new Error("ASSET_TEXT_EXTRACTION_ENCODING")
    );

    const result = await resolveAttachmentTextSnapshot(asset());

    expect(result).toEqual({ truncated: false, warning: expect.any(String) });
    expect(result.text).toBeUndefined();
  });
});
