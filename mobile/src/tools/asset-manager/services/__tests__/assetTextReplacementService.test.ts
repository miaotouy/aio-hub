import { beforeEach, describe, expect, it, vi } from "vitest";

const assetService = vi.hoisted(() => ({
  analyzeAssetDeletion: vi.fn(),
  deleteAssets: vi.fn(),
  extractAssetText: vi.fn(),
  getAssetDetail: vi.fn(),
}));
const chatService = vi.hoisted(() => ({
  drainAssetUsageOutbox: vi.fn(),
  replaceChatAssetWithText: vi.fn(),
}));

vi.mock("../assetService", () => assetService);
vi.mock("../../../llm-chat/services/chatStorageService", () => chatService);
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn() }),
}));

import { replaceAssetsWithExtractedText } from "../assetTextReplacementService";

function detail(assetId = "asset-text") {
  return {
    id: assetId,
    kind: "document",
    availability: "ready",
    retentionPolicy: "reclaimable",
    usages: [
      {
        moduleId: "llm-chat",
        entityType: "message",
        entityId: "message-1",
        role: "attachment",
        usagePolicy: "blocking",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assetService.getAssetDetail.mockResolvedValue(detail());
  assetService.extractAssetText.mockResolvedValue({
    assetId: "asset-text",
    text: "extracted text",
    mimeType: "text/plain",
    bytesRead: 14,
  });
  chatService.replaceChatAssetWithText.mockResolvedValue({
    updatedAttachments: 1,
    affectedMessages: 1,
    outboxEvents: 1,
  });
  chatService.drainAssetUsageOutbox
    .mockResolvedValueOnce({ inspected: 1, delivered: 1, failed: 0 })
    .mockResolvedValueOnce({ inspected: 0, delivered: 0, failed: 0 });
  assetService.analyzeAssetDeletion.mockResolvedValue({
    canDeleteAll: true,
    requiresAdvisoryConfirmation: true,
    items: [{ assetId: "asset-text", canDelete: true }],
  });
  assetService.deleteAssets.mockResolvedValue({
    deletedCount: 0,
    reclaimedCount: 1,
    cleanedFileCount: 1,
    pendingCleanupCount: 0,
  });
});

describe("asset text replacement orchestration", () => {
  it("persists consumer text and drains usage before deleting the original", async () => {
    const result = await replaceAssetsWithExtractedText(["asset-text"]);

    expect(result).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(assetService.extractAssetText).toHaveBeenCalledWith("asset-text");
    expect(chatService.replaceChatAssetWithText).toHaveBeenCalledWith(
      "asset-text",
      "extracted text"
    );
    expect(chatService.drainAssetUsageOutbox).toHaveBeenCalledTimes(2);
    expect(assetService.analyzeAssetDeletion).toHaveBeenCalledWith([
      "asset-text",
    ]);
    expect(assetService.deleteAssets).toHaveBeenCalledWith(
      ["asset-text"],
      true
    );
    expect(
      chatService.replaceChatAssetWithText.mock.invocationCallOrder[0]
    ).toBeLessThan(assetService.deleteAssets.mock.invocationCallOrder[0]);
  });

  it("keeps the original when consumer persistence fails", async () => {
    chatService.replaceChatAssetWithText.mockRejectedValueOnce(
      new Error("CHAT_STORAGE_UNAVAILABLE")
    );

    const result = await replaceAssetsWithExtractedText(["asset-text"]);

    expect(result.items[0]).toMatchObject({
      status: "failed",
      errorCode: "CHAT_STORAGE_UNAVAILABLE",
    });
    expect(assetService.deleteAssets).not.toHaveBeenCalled();
  });

  it("keeps the original when post-persistence deletion analysis is blocked", async () => {
    assetService.analyzeAssetDeletion.mockResolvedValueOnce({
      canDeleteAll: false,
      requiresAdvisoryConfirmation: false,
      items: [
        {
          assetId: "asset-text",
          canDelete: false,
          blockedReason: "blocking_usage",
        },
      ],
    });

    const result = await replaceAssetsWithExtractedText(["asset-text"]);

    expect(chatService.replaceChatAssetWithText).toHaveBeenCalledOnce();
    expect(result.items[0]).toMatchObject({
      status: "failed",
      errorCode: "blocking_usage",
    });
    expect(assetService.deleteAssets).not.toHaveBeenCalled();
  });

  it("rejects unsupported consumers before reading asset bytes", async () => {
    assetService.getAssetDetail.mockResolvedValueOnce({
      ...detail(),
      usages: [
        {
          moduleId: "media-generator",
          entityType: "task",
          entityId: "task-1",
          role: "input",
          usagePolicy: "blocking",
        },
      ],
    });

    const result = await replaceAssetsWithExtractedText(["asset-text"]);

    expect(result.items[0].errorCode).toBe(
      "ASSET_TEXT_REPLACEMENT_UNSUPPORTED_CONSUMER"
    );
    expect(assetService.extractAssetText).not.toHaveBeenCalled();
    expect(assetService.deleteAssets).not.toHaveBeenCalled();
  });

  it("continues later items after an item fails", async () => {
    assetService.getAssetDetail
      .mockResolvedValueOnce({ ...detail("asset-a"), availability: "missing" })
      .mockResolvedValueOnce(detail("asset-b"));
    assetService.extractAssetText.mockResolvedValueOnce({
      assetId: "asset-b",
      text: "second item",
      mimeType: "text/plain",
      bytesRead: 11,
    });
    assetService.analyzeAssetDeletion.mockResolvedValueOnce({
      canDeleteAll: true,
      requiresAdvisoryConfirmation: true,
      items: [{ assetId: "asset-b", canDelete: true }],
    });

    const result = await replaceAssetsWithExtractedText([
      "asset-a",
      "asset-b",
    ]);

    expect(result).toMatchObject({ completedCount: 1, failedCount: 1 });
    expect(result.items.map((item) => item.assetId)).toEqual([
      "asset-a",
      "asset-b",
    ]);
    expect(assetService.deleteAssets).toHaveBeenCalledWith(["asset-b"], true);
  });
});
