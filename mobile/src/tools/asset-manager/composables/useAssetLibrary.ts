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
  AssetStorageSummary,
} from "../types";

export type AssetLibraryMode = "assets" | "storage";

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

export function createAssetListQuery(input: {
  search: string;
  kind: AssetKind | "all";
  libraryState: AssetLibraryState | "all";
  createdMonth: string;
  sourceModule: string;
}): AssetListQuery {
  return {
    search: input.search.trim() || undefined,
    kind: input.kind === "all" ? undefined : input.kind,
    libraryState: input.libraryState,
    createdMonth: input.createdMonth || undefined,
    sourceModule: input.sourceModule || undefined,
    includeHidden: input.libraryState !== "visible",
    includeUnavailable: true,
    limit: 100,
    offset: 0,
  };
}

export function useAssetLibrary() {
  let loadSequence = 0;
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
  const loading = ref(false);
  const error = ref<string | null>(null);
  const detail = ref<AssetDetail | null>(null);
  const preview = ref<AssetPreviewSource | null>(null);
  const importing = ref(false);
  const importProgress = ref<AssetImportProgressEvent | null>(null);
  const importJobs = ref<AssetImportJob[]>([]);
  const activeImportJobId = ref<string | null>(null);
  let importController: AbortController | null = null;

  const query = computed(() =>
    createAssetListQuery({
      search: search.value,
      kind: kind.value,
      libraryState: libraryState.value,
      createdMonth: createdMonth.value,
      sourceModule: sourceModule.value,
    })
  );

  const selected = computed(() =>
    assets.value.filter((asset) => selectedIds.value.includes(asset.id))
  );

  async function load(options: { keepSelection?: boolean } = {}) {
    const sequence = ++loadSequence;
    loading.value = true;
    error.value = null;
    try {
      const [records, storage, libraryFacets] = await Promise.all([
        listAssets(query.value),
        getAssetStorageSummary(),
        getAssetLibraryFacets(libraryState.value !== "visible"),
      ]);
      if (sequence !== loadSequence) return;
      assets.value = records;
      summary.value = storage;
      facets.value = libraryFacets;
      if (!options.keepSelection) selectedIds.value = [];
      else selectedIds.value = selectedIds.value.filter((id) => records.some((asset) => asset.id === id));
    } catch (cause) {
      if (sequence !== loadSequence) return;
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (sequence === loadSequence) loading.value = false;
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
    if (preview.value) await revokeAssetPreviewSource(preview.value.id).catch(() => undefined);
    preview.value = await getAssetPreviewSource(assetId);
  }

  async function closePreview() {
    if (!preview.value) return;
    const current = preview.value;
    preview.value = null;
    await revokeAssetPreviewSource(current.id).catch(() => undefined);
  }

  async function setHidden(hidden: boolean) {
    if (!selectedIds.value.length) return;
    await setAssetLibraryState(selectedIds.value, hidden ? "hidden" : "visible");
    customMessage(hidden ? "已隐藏所选资产" : "已恢复所选资产", "success");
    await load();
  }

  async function pinSelected(pinned: boolean) {
    if (!selectedIds.value.length) return;
    await setAssetRetentionPolicy(selectedIds.value, pinned ? "pinned" : "reclaimable");
    customMessage(pinned ? "已固定所选原件" : "已允许回收所选原件", "success");
    await load({ keepSelection: true });
  }

  async function removeSelected() {
    if (!selectedIds.value.length) return;
    const analysis = await analyzeAssetDeletion(selectedIds.value);
    if (!analysis.canDeleteAll) {
      customMessage("所选资产包含被引用或固定原件，无法删除", "warning");
      return;
    }
    let confirmAdvisory = false;
    if (analysis.requiresAdvisoryConfirmation) {
      confirmAdvisory = await customDialog({
        title: "确认清理原件",
        message: `仍有 ${analysis.items.filter((item) => item.advisoryUsageCount > 0).length} 项被建议引用，清理后会保留可恢复记录。`,
        confirmButtonText: "继续清理",
        cancelButtonText: "取消",
      });
      if (!confirmAdvisory) return;
    }
    const result = await deleteAssets(selectedIds.value, confirmAdvisory);
    customMessage(`已清理 ${result.deletedCount} 项资产`, "success");
    await load();
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

  watch([search, kind, libraryState, createdMonth, sourceModule], (_value, _oldValue, onCleanup) => {
    const timer = window.setTimeout(() => void load(), 220);
    onCleanup(() => window.clearTimeout(timer));
  });

  return {
    mode,
    assets,
    summary,
    facets,
    selectedIds,
    selected,
    search,
    kind,
    libraryState,
    createdMonth,
    sourceModule,
    loading,
    error,
    detail,
    preview,
    importing,
    importProgress,
    importJobs,
    activeImportJobId,
    query,
    load,
    toggleSelection,
    clearSelection,
    openDetail,
    openPreview,
    closePreview,
    setHidden,
    pinSelected,
    removeSelected,
    importSources,
    loadImportJobs,
    cancelImport,
    clearCache,
    repairLibrary,
  };
}
