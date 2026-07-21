import { computed, ref, watch } from "vue";
import { customDialog, customMessage } from "@/utils/feedback";
import {
  analyzeAssetDeletion,
  clearRebuildableAssetCache,
  cancelAssetImportJob,
  deleteAssets,
  getAssetImportJob,
  getAssetDetail,
  getAssetLibraryFacets,
  getAssetPreviewSource,
  getAssetStorageSummary,
  importAssetSources,
  listAssetImportJobs,
  listAssets,
  repairAssetLibrary,
  revokeAssetPreviewSource,
  setAssetLibraryState,
  setAssetRetentionPolicy,
} from "../services/assetService";
import { replaceAssetsWithExtractedText } from "../services/assetTextReplacementService";
import type {
  AssetDetail,
  AssetImportSource,
  AssetImportJob,
  AssetImportProgressEvent,
  AssetKind,
  AssetLibraryFacets,
  AssetLibraryState,
  AssetListQuery,
  AssetPreviewSource,
  AssetRecord,
  AssetRetentionPolicy,
  AssetStorageSummary,
  AssetUsageState,
} from "../types";

export type AssetLibraryMode = "assets" | "storage";
const ASSET_PAGE_SIZE = 100;

export function formatAssetBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unit = -1;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size >= 10 ? 0 : 1).replace(/\.0$/, "")} ${units[unit]}`;
}

export function createAssetListQuery(
  input: {
    search: string;
    kind: AssetKind | "all";
    libraryState: AssetLibraryState | "all";
    createdMonth: string;
    sourceModule: string;
    retentionPolicy: AssetRetentionPolicy | "all";
    usageState: AssetUsageState;
  },
  offset = 0
): AssetListQuery {
  return {
    search: input.search.trim() || undefined,
    kind: input.kind === "all" ? undefined : input.kind,
    libraryState: input.libraryState,
    createdMonth: input.createdMonth || undefined,
    sourceModule: input.sourceModule || undefined,
    retentionPolicy: input.retentionPolicy,
    usageState: input.usageState,
    includeHidden: input.libraryState !== "visible",
    includeUnavailable: true,
    limit: ASSET_PAGE_SIZE,
    offset,
  };
}

export function useAssetLibrary() {
  let loadSequence = 0;
  let loadMoreRequestId = 0;
  let loadedOffset = 0;
  const mode = ref<AssetLibraryMode>("assets");
  const assets = ref<AssetRecord[]>([]);
  const summary = ref<AssetStorageSummary | null>(null);
  const facets = ref<AssetLibraryFacets>({ byMonth: [], bySource: [] });
  const selectedIds = ref<string[]>([]);
  const search = ref("");
  const kind = ref<AssetKind | "all">("all");
  const libraryState = ref<AssetLibraryState | "all">("visible");
  const createdMonth = ref("");
  const sourceModule = ref("");
  const retentionPolicy = ref<AssetRetentionPolicy | "all">("all");
  const usageState = ref<AssetUsageState>("all");
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(false);
  const error = ref<string | null>(null);
  const detail = ref<AssetDetail | null>(null);
  const preview = ref<AssetPreviewSource | null>(null);
  const importing = ref(false);
  const replacingText = ref(false);
  const importProgress = ref<AssetImportProgressEvent | null>(null);
  const importJobs = ref<AssetImportJob[]>([]);
  const activeImportJobId = ref<string | null>(null);
  let importController: AbortController | null = null;
  let previewRequestId = 0;

  const query = computed(() =>
    createAssetListQuery({
      search: search.value,
      kind: kind.value,
      libraryState: libraryState.value,
      createdMonth: createdMonth.value,
      sourceModule: sourceModule.value,
      retentionPolicy: retentionPolicy.value,
      usageState: usageState.value,
    })
  );

  const selected = computed(() =>
    assets.value.filter((asset) => selectedIds.value.includes(asset.id))
  );

  const textReplacementCandidates = computed(() =>
    selected.value.filter(
      (asset) => asset.kind === "document" && asset.availability === "ready"
    )
  );

  async function listPages(
    baseQuery: AssetListQuery,
    targetOffset: number,
    sequence: number
  ) {
    const records: AssetRecord[] = [];
    const loadedIds = new Set<string>();
    let offset = 0;
    let pageLength = 0;
    do {
      const page = await listAssets({
        ...baseQuery,
        limit: ASSET_PAGE_SIZE,
        offset,
      });
      if (sequence !== loadSequence) break;
      pageLength = page.length;
      offset += pageLength;
      for (const asset of page) {
        if (!loadedIds.has(asset.id)) {
          loadedIds.add(asset.id);
          records.push(asset);
        }
      }
    } while (pageLength === ASSET_PAGE_SIZE && offset < targetOffset);
    return {
      records,
      loadedOffset: offset,
      hasMore: pageLength === ASSET_PAGE_SIZE,
    };
  }

  async function load(options: { keepSelection?: boolean } = {}) {
    const targetOffset = options.keepSelection
      ? Math.max(loadedOffset, ASSET_PAGE_SIZE)
      : ASSET_PAGE_SIZE;
    const sequence = ++loadSequence;
    loadMoreRequestId += 1;
    loading.value = true;
    loadingMore.value = false;
    hasMore.value = false;
    error.value = null;
    try {
      const [pageResult, storage, libraryFacets] = await Promise.all([
        listPages(query.value, targetOffset, sequence),
        getAssetStorageSummary(),
        getAssetLibraryFacets(libraryState.value !== "visible"),
      ]);
      if (sequence !== loadSequence) return;
      assets.value = pageResult.records;
      loadedOffset = pageResult.loadedOffset;
      hasMore.value = pageResult.hasMore;
      summary.value = storage;
      facets.value = libraryFacets;
      if (!options.keepSelection) selectedIds.value = [];
      else selectedIds.value = selectedIds.value.filter((id) => pageResult.records.some((asset) => asset.id === id));
    } catch (cause) {
      if (sequence !== loadSequence) return;
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (sequence === loadSequence) loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    const sequence = loadSequence;
    const requestId = ++loadMoreRequestId;
    loadingMore.value = true;
    try {
      const records = await listAssets({
        ...query.value,
        offset: loadedOffset,
      });
      if (sequence !== loadSequence) return;
      loadedOffset += records.length;
      const loadedIds = new Set(assets.value.map((asset) => asset.id));
      assets.value = [
        ...assets.value,
        ...records.filter((asset) => !loadedIds.has(asset.id)),
      ];
      hasMore.value = records.length === ASSET_PAGE_SIZE;
    } catch {
      if (sequence === loadSequence) {
        customMessage("无法加载更多资产", "error");
      }
    } finally {
      if (requestId === loadMoreRequestId) loadingMore.value = false;
    }
  }

  function toggleSelection(assetId: string) {
    selectedIds.value = selectedIds.value.includes(assetId)
      ? selectedIds.value.filter((id) => id !== assetId)
      : [...selectedIds.value, assetId];
  }

  function clearSelection() {
    selectedIds.value = [];
  }

  async function openDetail(assetId: string) {
    detail.value = await getAssetDetail(assetId);
  }

  async function openPreview(assetId: string) {
    const requestId = ++previewRequestId;
    if (preview.value) await revokeAssetPreviewSource(preview.value.id).catch(() => undefined);
    const nextPreview = await getAssetPreviewSource(assetId);
    if (requestId !== previewRequestId) {
      await revokeAssetPreviewSource(nextPreview.id).catch(() => undefined);
      return;
    }
    preview.value = nextPreview;
  }

  async function closePreview() {
    previewRequestId += 1;
    if (!preview.value) return;
    const current = preview.value;
    preview.value = null;
    await revokeAssetPreviewSource(current.id).catch(() => undefined);
  }

  async function updateHiddenAssets(
    assetIds: string[],
    hidden: boolean,
    keepSelection: boolean
  ) {
    if (!assetIds.length) return false;
    await setAssetLibraryState(assetIds, hidden ? "hidden" : "visible");
    customMessage(
      hidden
        ? `已隐藏 ${assetIds.length} 项资产`
        : `已恢复 ${assetIds.length} 项资产`,
      "success"
    );
    await load(keepSelection ? { keepSelection: true } : undefined);
    return true;
  }

  async function setHidden(hidden: boolean) {
    return updateHiddenAssets([...selectedIds.value], hidden, false);
  }

  async function setDetailHidden(assetId: string, hidden: boolean) {
    return updateHiddenAssets([assetId], hidden, true);
  }

  async function updateRetentionAssets(assetIds: string[], pinned: boolean) {
    if (!assetIds.length) return false;
    await setAssetRetentionPolicy(assetIds, pinned ? "pinned" : "reclaimable");
    customMessage(
      pinned
        ? `已固定 ${assetIds.length} 项原件`
        : `已允许回收 ${assetIds.length} 项原件`,
      "success"
    );
    await load({ keepSelection: true });
    return true;
  }

  async function pinSelected(pinned: boolean) {
    return updateRetentionAssets([...selectedIds.value], pinned);
  }

  async function pinDetailAsset(assetId: string, pinned: boolean) {
    const updated = await updateRetentionAssets([assetId], pinned);
    if (updated && detail.value?.id === assetId) {
      detail.value = await getAssetDetail(assetId);
    }
    return updated;
  }

  async function removeAssets(
    assetIds: string[],
    options: { keepSelection?: boolean } = {}
  ) {
    const uniqueIds = [...new Set(assetIds)];
    if (!uniqueIds.length) return false;
    const analysis = await analyzeAssetDeletion(uniqueIds);
    if (!analysis.canDeleteAll) {
      customMessage("目标资产包含被引用或固定原件，无法删除", "warning");
      return false;
    }
    let confirmAdvisory = false;
    if (analysis.requiresAdvisoryConfirmation) {
      confirmAdvisory = await customDialog({
        title: "确认清理原件",
        message: `仍有 ${analysis.items.filter((item) => item.advisoryUsageCount > 0).length} 项被建议引用，清理后会保留可恢复记录。`,
        confirmButtonText: "继续清理",
        cancelButtonText: "取消",
      });
      if (!confirmAdvisory) return false;
    }
    const result = await deleteAssets(uniqueIds, confirmAdvisory);
    const cleanedCount = result.deletedCount + result.reclaimedCount;
    customMessage(`已清理 ${cleanedCount} 项资产`, "success");
    await load(options.keepSelection ? { keepSelection: true } : undefined);
    return true;
  }

  async function removeSelected() {
    return removeAssets([...selectedIds.value]);
  }

  async function removeDetailAsset(assetId: string) {
    return removeAssets([assetId], { keepSelection: true });
  }

  async function replaceWithExtractedText(
    assetIds = textReplacementCandidates.value.map((asset) => asset.id)
  ) {
    const uniqueIds = [...new Set(assetIds)];
    if (!uniqueIds.length || replacingText.value) return;
    const confirmed = await customDialog({
      title: "提取文本并清理原件",
      message: `将处理 ${uniqueIds.length} 项文本文档。文本会先写入聊天附件快照，确认引用已降级后才清理原件；失败项会保留原件。`,
      confirmButtonText: "开始处理",
      cancelButtonText: "取消",
    });
    if (!confirmed) return;
    replacingText.value = true;
    try {
      const result = await replaceAssetsWithExtractedText(uniqueIds);
      if (result.failedCount === 0) {
        customMessage(
          `已提取文本并清理 ${result.completedCount} 项原件`,
          "success"
        );
      } else if (result.completedCount > 0) {
        customMessage(
          `已完成 ${result.completedCount} 项，${result.failedCount} 项保留原件`,
          "warning"
        );
      } else {
        customMessage("没有原件被清理，所选项不满足文本替代条件", "warning");
      }
      if (
        detail.value &&
        result.items.some(
          (item) =>
            item.assetId === detail.value?.id && item.status === "completed"
        )
      ) {
        detail.value = null;
      }
      await load();
      return result;
    } finally {
      replacingText.value = false;
    }
  }

  async function importSources(sources: AssetImportSource[]) {
    importing.value = true;
    importProgress.value = null;
    activeImportJobId.value = null;
    importController = new AbortController();
    try {
      const results = await importAssetSources(sources, {
        signal: importController.signal,
        onProgress: (event) => {
          importProgress.value = event;
          activeImportJobId.value = event.jobId;
        },
      });
      const successCount = results.filter((result) => result.asset).length;
      const failedCount = results.filter((result) => result.status === "failed").length;
      if (successCount === 0 && failedCount > 0) {
        throw new Error(results[0]?.errorCode ?? "ASSET_IMPORT_FAILED");
      }
      customMessage(
        failedCount > 0
          ? `已导入 ${successCount} 项，${failedCount} 项失败`
          : `已导入 ${successCount} 项资产`,
        failedCount > 0 ? "warning" : "success"
      );
      await load();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        customMessage("导入任务已取消", "info");
        return;
      }
      throw cause;
    } finally {
      importing.value = false;
      importController = null;
      await loadImportJobs().catch(() => undefined);
    }
  }

  async function loadImportJobs(limit = 12) {
    const jobs = await listAssetImportJobs(limit);
    importJobs.value = jobs;
    if (!importing.value) {
      activeImportJobId.value =
        jobs.find((job) => job.state === "running" || job.state === "pending")?.id ?? null;
    }
  }

  async function cancelImport(jobId = activeImportJobId.value) {
    if (!jobId) return;
    if (importController && jobId === activeImportJobId.value) {
      importController.abort();
      return;
    }
    await cancelAssetImportJob(jobId);
    const job = await getAssetImportJob(jobId);
    if (job.state === "cancelled") activeImportJobId.value = null;
    await loadImportJobs();
  }

  async function clearCache() {
    const result = await clearRebuildableAssetCache();
    customMessage(`已释放 ${formatAssetBytes(result.reclaimedBytes)} 缓存`, "success");
    await load({ keepSelection: true });
  }

  async function repairLibrary() {
    const report = await repairAssetLibrary();
    customMessage(
      `修复完成，清理 ${report.cleanedPendingFiles + report.cleanedTemporaryFiles + report.cleanedOrphanFiles} 个文件`,
      "success"
    );
    await load({ keepSelection: true });
  }

  watch(
    [search, kind, libraryState, createdMonth, sourceModule, retentionPolicy, usageState],
    (_value, _oldValue, onCleanup) => {
      loadSequence += 1;
      loadMoreRequestId += 1;
      loadedOffset = 0;
      hasMore.value = false;
      loadingMore.value = false;
      assets.value = [];
      selectedIds.value = [];
      loading.value = true;
      error.value = null;
      const timer = setTimeout(() => void load(), 220);
      onCleanup(() => clearTimeout(timer));
    }
  );

  return {
    mode,
    assets,
    summary,
    facets,
    selectedIds,
    selected,
    textReplacementCandidates,
    search,
    kind,
    libraryState,
    createdMonth,
    sourceModule,
    retentionPolicy,
    usageState,
    loading,
    loadingMore,
    hasMore,
    error,
    detail,
    preview,
    importing,
    replacingText,
    importProgress,
    importJobs,
    activeImportJobId,
    query,
    load,
    loadMore,
    toggleSelection,
    clearSelection,
    openDetail,
    openPreview,
    closePreview,
    setHidden,
    setDetailHidden,
    pinSelected,
    pinDetailAsset,
    removeSelected,
    removeDetailAsset,
    replaceWithExtractedText,
    importSources,
    loadImportJobs,
    cancelImport,
    clearCache,
    repairLibrary,
  };
}
