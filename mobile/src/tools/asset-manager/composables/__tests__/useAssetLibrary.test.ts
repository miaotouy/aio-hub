import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  analyzeAssetDeletion: vi.fn(),
  cancelAssetImportJob: vi.fn(),
  clearRebuildableAssetCache: vi.fn(),
  deleteAssets: vi.fn(),
  getAssetDetail: vi.fn(),
  getAssetImportJob: vi.fn(),
  getAssetLibraryFacets: vi.fn(),
  getAssetPreviewSource: vi.fn(),
  getAssetStorageSummary: vi.fn(),
  importAssetSources: vi.fn(),
  listAssetImportJobs: vi.fn(),
  listAssets: vi.fn(),
  repairAssetLibrary: vi.fn(),
  revokeAssetPreviewSource: vi.fn(),
  setAssetLibraryState: vi.fn(),
  setAssetRetentionPolicy: vi.fn(),
}));

const feedback = vi.hoisted(() => ({
  customDialog: vi.fn(),
  customMessage: vi.fn(),
}));

vi.mock("../../services/assetService", () => service);
vi.mock("@/utils/feedback", () => feedback);

import {
  createAssetListQuery,
  formatAssetBytes,
  useAssetLibrary,
} from "../useAssetLibrary";

beforeEach(() => {
  vi.clearAllMocks();
  service.listAssets.mockResolvedValue([]);
  service.getAssetStorageSummary.mockResolvedValue({
    assetCount: 0,
    readyCount: 0,
    missingCount: 0,
    reclaimedCount: 0,
    originalBytes: 0,
    reclaimableBytes: 0,
    cacheBytes: 0,
    temporaryBytes: 0,
    pendingCleanupCount: 0,
    byKind: [],
  });
  service.getAssetLibraryFacets.mockResolvedValue({ byMonth: [], bySource: [] });
  service.listAssetImportJobs.mockResolvedValue([]);
});

describe("asset library query", () => {
  it("trims search and maps visible filters to the backend contract", () => {
    expect(
      createAssetListQuery({
        search: "  report  ",
        kind: "document",
        libraryState: "hidden",
        createdMonth: "2026-07",
        sourceModule: "llm-chat",
      })
    ).toEqual({
      search: "report",
      kind: "document",
      libraryState: "hidden",
      createdMonth: "2026-07",
      sourceModule: "llm-chat",
      includeHidden: true,
      includeUnavailable: true,
      limit: 100,
      offset: 0,
    });
  });

  it("formats storage values without losing the unit", () => {
    expect(formatAssetBytes(512)).toBe("512 B");
    expect(formatAssetBytes(1536)).toBe("1.5 KB");
    expect(formatAssetBytes(12 * 1024 * 1024)).toBe("12 MB");
  });
});

describe("asset selection actions", () => {
  it("dispatches hidden and restore states for the exact selection", async () => {
    const library = useAssetLibrary();
    library.selectedIds.value = ["asset-1", "asset-2"];
    service.setAssetLibraryState.mockResolvedValue(2);

    await library.setHidden(true);
    expect(service.setAssetLibraryState).toHaveBeenNthCalledWith(
      1,
      ["asset-1", "asset-2"],
      "hidden"
    );

    library.selectedIds.value = ["asset-1"];
    await library.setHidden(false);
    expect(service.setAssetLibraryState).toHaveBeenNthCalledWith(
      2,
      ["asset-1"],
      "visible"
    );
  });

  it("requires advisory confirmation before physical deletion", async () => {
    const library = useAssetLibrary();
    library.selectedIds.value = ["asset-1"];
    service.analyzeAssetDeletion.mockResolvedValue({
      canDeleteAll: true,
      requiresAdvisoryConfirmation: true,
      totalSizeBytes: 1024,
      items: [
        {
          assetId: "asset-1",
          displayName: "draft.txt",
          availability: "ready",
          retentionPolicy: "reclaimable",
          sizeBytes: 1024,
          blockingUsageCount: 0,
          advisoryUsageCount: 1,
          canDelete: true,
          requiresAdvisoryConfirmation: true,
        },
      ],
    });
    service.deleteAssets.mockResolvedValue({
      deletedCount: 1,
      reclaimedCount: 1,
      cleanedFileCount: 1,
      pendingCleanupCount: 0,
    });
    feedback.customDialog.mockResolvedValue(true);

    await library.removeSelected();

    expect(feedback.customDialog).toHaveBeenCalledOnce();
    expect(service.deleteAssets).toHaveBeenCalledWith(["asset-1"], true);
  });

  it("does not delete when advisory confirmation is cancelled", async () => {
    const library = useAssetLibrary();
    library.selectedIds.value = ["asset-1"];
    service.analyzeAssetDeletion.mockResolvedValue({
      canDeleteAll: true,
      requiresAdvisoryConfirmation: true,
      totalSizeBytes: 1024,
      items: [
        {
          assetId: "asset-1",
          advisoryUsageCount: 1,
        },
      ],
    });
    feedback.customDialog.mockResolvedValue(false);

    await library.removeSelected();

    expect(service.deleteAssets).not.toHaveBeenCalled();
  });
});

describe("persisted import jobs", () => {
  it("restores the active job and cancels it through the native contract", async () => {
    const runningJob = {
      id: "job-1",
      sourceKind: "file_picker",
      state: "running",
      bytesCopied: 1024,
      totalBytes: 2048,
      sourceCount: 1,
      completedCount: 0,
      currentSourceIndex: 0,
      results: [],
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:01.000Z",
    } as const;
    const cancelledJob = { ...runningJob, state: "cancelled" as const };
    service.listAssetImportJobs
      .mockResolvedValueOnce([runningJob])
      .mockResolvedValueOnce([cancelledJob]);
    service.cancelAssetImportJob.mockResolvedValue(true);
    service.getAssetImportJob.mockResolvedValue(cancelledJob);
    const library = useAssetLibrary();

    await library.loadImportJobs();
    expect(library.activeImportJobId.value).toBe("job-1");

    await library.cancelImport("job-1");
    expect(service.cancelAssetImportJob).toHaveBeenCalledWith("job-1");
    expect(service.getAssetImportJob).toHaveBeenCalledWith("job-1");
    expect(library.activeImportJobId.value).toBeNull();
  });
});

describe("import result feedback", () => {
  it("rejects a batch when every selected source failed", async () => {
    service.importAssetSources.mockResolvedValue([
      {
        sourceIndex: 0,
        status: "failed",
        errorCode: "ASSET_SOURCE_OPEN",
      },
    ]);
    const library = useAssetLibrary();

    await expect(
      library.importSources([
        {
          reference: "content://picker/item/1",
          originKind: "photo_picker",
          sourceModule: "asset-manager",
        },
      ])
    ).rejects.toThrow("ASSET_SOURCE_OPEN");
    expect(feedback.customMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("已导入 0 项"),
      "success"
    );
  });
});
