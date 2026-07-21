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

const textReplacement = vi.hoisted(() => ({
  replaceAssetsWithExtractedText: vi.fn(),
}));

vi.mock("../../services/assetService", () => service);
vi.mock("../../services/assetTextReplacementService", () => textReplacement);
vi.mock("@/utils/feedback", () => feedback);

import {
  createAssetListQuery,
  formatAssetBytes,
  useAssetLibrary,
} from "../useAssetLibrary";
import { nextTick } from "vue";

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

  it("maps the requested page offset without changing the page size", () => {
    expect(
      createAssetListQuery(
        {
          search: "",
          kind: "all",
          libraryState: "visible",
          createdMonth: "",
          sourceModule: "",
        },
        100
      )
    ).toMatchObject({ limit: 100, offset: 100 });
  });
});

describe("asset library pagination", () => {
  it("appends the next page and stops when the backend returns a short page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `asset-${index}`,
    }));
    service.listAssets
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: "asset-100" }]);
    const library = useAssetLibrary();

    await library.load();
    expect(library.hasMore.value).toBe(true);

    await library.loadMore();

    expect(service.listAssets).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 100, offset: 100 })
    );
    expect(library.assets.value).toHaveLength(101);
    expect(library.hasMore.value).toBe(false);
    expect(library.loadingMore.value).toBe(false);
  });

  it("advances the backend offset even when a page contains duplicate ids", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `asset-${index}`,
    }));
    const overlappingPage = [
      ...firstPage.slice(99),
      ...Array.from({ length: 99 }, (_, index) => ({ id: `asset-${100 + index}` })),
    ];
    service.listAssets
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(overlappingPage)
      .mockResolvedValueOnce([{ id: "asset-200" }]);
    const library = useAssetLibrary();

    await library.load();
    await library.loadMore();
    await library.loadMore();

    expect(service.listAssets).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ limit: 100, offset: 200 })
    );
    expect(library.assets.value).toHaveLength(200);
    expect(library.hasMore.value).toBe(false);
  });

  it("invalidates old pages immediately without letting their loading state clobber the new query", async () => {
    vi.useFakeTimers();
    try {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        id: `asset-${index}`,
      }));
      const filteredPage = Array.from({ length: 100 }, (_, index) => ({
        id: `filtered-${index}`,
      }));
      let resolveOldPage!: (value: Array<{ id: string }>) => void;
      let resolveFilteredPage!: (value: Array<{ id: string }>) => void;
      service.listAssets
        .mockResolvedValueOnce(firstPage)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveOldPage = resolve;
          })
        )
        .mockResolvedValueOnce(filteredPage)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFilteredPage = resolve;
          })
        );
      const library = useAssetLibrary();

      await library.load();
      const oldPage = library.loadMore();
      library.search.value = "filtered";
      await nextTick();

      expect(library.assets.value).toEqual([]);
      expect(library.hasMore.value).toBe(false);
      await vi.advanceTimersByTimeAsync(220);
      expect(library.assets.value).toEqual(filteredPage);

      const filteredNextPage = library.loadMore();
      expect(library.loadingMore.value).toBe(true);
      resolveOldPage([{ id: "stale-asset" }]);
      await oldPage;
      expect(library.loadingMore.value).toBe(true);
      resolveFilteredPage([{ id: "filtered-100" }]);
      await filteredNextPage;

      expect(library.assets.value).toEqual([
        ...filteredPage,
        { id: "filtered-100" },
      ]);
      expect(service.listAssets).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ search: "filtered", offset: 0 })
      );
      expect(library.loadingMore.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reloads every consumed page when preserving a second-page selection", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `asset-${index}`,
    }));
    const secondPage = [{ id: "asset-100" }];
    service.listAssets
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const library = useAssetLibrary();

    await library.load();
    await library.loadMore();
    library.selectedIds.value = ["asset-100"];
    await library.load({ keepSelection: true });

    expect(service.listAssets).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ offset: 100 })
    );
    expect(library.assets.value).toHaveLength(101);
    expect(library.selectedIds.value).toEqual(["asset-100"]);
  });

  it("ignores a next page that resolves after a filter reload", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `asset-${index}`,
    }));
    let resolveNextPage!: (value: Array<{ id: string }>) => void;
    service.listAssets
      .mockResolvedValueOnce(firstPage)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNextPage = resolve;
        })
      )
      .mockResolvedValueOnce([{ id: "filtered-asset" }]);
    const library = useAssetLibrary();

    await library.load();
    const pendingPage = library.loadMore();
    await library.load();
    resolveNextPage([{ id: "stale-asset" }]);
    await pendingPage;

    expect(library.assets.value).toEqual([{ id: "filtered-asset" }]);
    expect(library.loadingMore.value).toBe(false);
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
      deletedCount: 0,
      reclaimedCount: 1,
      cleanedFileCount: 1,
      pendingCleanupCount: 0,
    });
    feedback.customDialog.mockResolvedValue(true);

    await library.removeSelected();

    expect(feedback.customDialog).toHaveBeenCalledOnce();
    expect(service.deleteAssets).toHaveBeenCalledWith(["asset-1"], true);
    expect(feedback.customMessage).toHaveBeenCalledWith(
      "已清理 1 项资产",
      "success"
    );
  });

  it("revokes a late preview response after the preview is closed", async () => {
    const library = useAssetLibrary();
    let resolvePreview!: (value: { id: string }) => void;
    service.getAssetPreviewSource.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve;
      })
    );
    service.revokeAssetPreviewSource.mockResolvedValue(true);

    const pending = library.openPreview("asset-1");
    await library.closePreview();
    resolvePreview({ id: "preview-late" });
    await pending;

    expect(library.preview.value).toBeNull();
    expect(service.revokeAssetPreviewSource).toHaveBeenCalledWith(
      "preview-late"
    );
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

  it("confirms text replacement and reports partial batch results", async () => {
    const library = useAssetLibrary();
    library.assets.value = [
      {
        id: "asset-a",
        kind: "document",
        availability: "ready",
      },
      {
        id: "asset-image",
        kind: "image",
        availability: "ready",
      },
    ] as never;
    library.selectedIds.value = ["asset-a", "asset-image"];
    feedback.customDialog.mockResolvedValueOnce(true);
    textReplacement.replaceAssetsWithExtractedText.mockResolvedValueOnce({
      completedCount: 1,
      failedCount: 1,
      items: [
        { assetId: "asset-a", status: "completed" },
        { assetId: "asset-b", status: "failed" },
      ],
    });

    await library.replaceWithExtractedText(["asset-a", "asset-b"]);

    expect(feedback.customDialog).toHaveBeenCalledWith(
      expect.objectContaining({ confirmButtonText: "开始处理" })
    );
    expect(textReplacement.replaceAssetsWithExtractedText).toHaveBeenCalledWith(
      ["asset-a", "asset-b"]
    );
    expect(feedback.customMessage).toHaveBeenCalledWith(
      "已完成 1 项，1 项保留原件",
      "warning"
    );
    expect(library.replacingText.value).toBe(false);
  });

  it("does not start text replacement after confirmation is cancelled", async () => {
    const library = useAssetLibrary();
    feedback.customDialog.mockResolvedValueOnce(false);

    await library.replaceWithExtractedText(["asset-a"]);

    expect(textReplacement.replaceAssetsWithExtractedText).not.toHaveBeenCalled();
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
