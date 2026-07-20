import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AssetImportJob,
  AssetImportProgressEvent,
  AssetImportSource,
} from "../../types";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  Channel: class<T> {
    onmessage: (message: T) => void = () => undefined;
  },
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import {
  clearRebuildableAssetCache,
  getAssetLibraryFacets,
  importAssetSources,
  listAssetImportJobs,
  setAssetLibraryState,
  startAssetImportJob,
} from "../assetService";

const sources: AssetImportSource[] = [
  {
    reference: "content://picker/item/1",
    originKind: "file_picker",
    sourceModule: "asset-manager-test",
    originalName: "sample.txt",
  },
];

function job(values: Partial<AssetImportJob> = {}): AssetImportJob {
  return {
    id: "job-1",
    sourceKind: "file_picker",
    state: "pending",
    bytesCopied: 0,
    totalBytes: null,
    sourceCount: 1,
    completedCount: 0,
    currentSourceIndex: null,
    results: [],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...values,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe("asset import jobs", () => {
  it("forwards native channel progress while starting a job", async () => {
    const progress: AssetImportProgressEvent = {
      jobId: "job-1",
      state: "running",
      bytesCopied: 4_194_304,
      totalBytes: null,
      sourceCount: 1,
      completedCount: 0,
      currentSourceIndex: 0,
    };
    invokeMock.mockImplementationOnce(async (command, args) => {
      expect(command).toBe("asset_start_import_job");
      expect(args.sources).toEqual(sources);
      args.onEvent.onmessage(progress);
      return job();
    });
    const onProgress = vi.fn();

    await expect(startAssetImportJob(sources, onProgress)).resolves.toEqual(job());
    expect(onProgress).toHaveBeenCalledWith(progress);
  });

  it("polls a job to completion and returns item results", async () => {
    const completed = job({
      state: "completed",
      completedCount: 1,
      results: [{ sourceIndex: 0, status: "imported" }],
    });
    invokeMock
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(completed);

    await expect(
      importAssetSources(sources, { pollIntervalMs: 50 })
    ).resolves.toEqual(completed.results);
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "asset_get_import_job",
      { jobId: "job-1" }
    );
  });

  it("cancels the native job when its abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    invokeMock.mockResolvedValueOnce(job()).mockResolvedValueOnce(true);

    await expect(
      importAssetSources(sources, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "asset_cancel_import_job",
      { jobId: "job-1" }
    );
  });

  it("lists persisted jobs for WebView recovery", async () => {
    invokeMock.mockResolvedValueOnce([job({ state: "failed" })]);

    await expect(listAssetImportJobs(12)).resolves.toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith("asset_list_import_jobs", {
      limit: 12,
    });
  });
});

describe("asset library management", () => {
  it("updates library state with the exact selected asset ids", async () => {
    invokeMock.mockResolvedValueOnce({ updatedCount: 2 });

    await expect(
      setAssetLibraryState(["asset-1", "asset-2"], "hidden")
    ).resolves.toBe(2);
    expect(invokeMock).toHaveBeenCalledWith("asset_set_library_state", {
      assetIds: ["asset-1", "asset-2"],
      libraryState: "hidden",
    });
  });

  it("reads facets and clears only the requested asset cache", async () => {
    invokeMock
      .mockResolvedValueOnce({ byMonth: [], bySource: [] })
      .mockResolvedValueOnce({
        removedVariantCount: 1,
        reclaimedBytes: 1024,
        cleanedFileCount: 1,
        pendingCleanupCount: 0,
      });

    await expect(getAssetLibraryFacets(true)).resolves.toEqual({
      byMonth: [],
      bySource: [],
    });
    await expect(clearRebuildableAssetCache(["asset-1"])).resolves.toMatchObject({
      reclaimedBytes: 1024,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "asset_get_library_facets",
      { includeHidden: true }
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "asset_clear_rebuildable_cache",
      { assetIds: ["asset-1"] }
    );
  });
});
