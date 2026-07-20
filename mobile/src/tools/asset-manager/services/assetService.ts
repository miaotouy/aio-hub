import { Channel, invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  AssetCacheClearResult,
  AssetDeleteAnalysis,
  AssetDeleteResult,
  AssetDetail,
  AssetExportResult,
  AssetImportJob,
  AssetImportProgressEvent,
  AssetImportResult,
  AssetImportSource,
  AssetLibraryFacets,
  AssetLibraryState,
  AssetListQuery,
  AssetPreviewSource,
  AssetRecord,
  AssetRepairReport,
  AssetRetentionPolicy,
  AssetStorageSummary,
  AssetShareResult,
  AssetUsageInput,
} from "../types";

const logger = createModuleLogger("asset-manager/service");
const errorHandler = createModuleErrorHandler("asset-manager/service");

const TERMINAL_IMPORT_STATES = new Set<AssetImportJob["state"]>([
  "completed",
  "failed",
  "cancelled",
]);
const activeImportChannels = new Map<
  string,
  Channel<AssetImportProgressEvent>
>();

export interface AssetImportOptions {
  onProgress?: (event: AssetImportProgressEvent) => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
}

function abortError(): Error {
  const error = new Error("资产导入已取消");
  error.name = "AbortError";
  return error;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isAssetImportJobTerminal(job: AssetImportJob): boolean {
  return TERMINAL_IMPORT_STATES.has(job.state);
}

export async function startAssetImportJob(
  sources: AssetImportSource[],
  onProgress?: (event: AssetImportProgressEvent) => void
): Promise<AssetImportJob> {
  const onEvent = new Channel<AssetImportProgressEvent>();
  let terminalEventSeen = false;
  onEvent.onmessage = (event) => {
    onProgress?.(event);
    if (TERMINAL_IMPORT_STATES.has(event.state)) {
      terminalEventSeen = true;
      activeImportChannels.delete(event.jobId);
    }
  };
  const job = await invoke<AssetImportJob>("asset_start_import_job", {
    sources,
    onEvent,
  });
  if (!isAssetImportJobTerminal(job) && !terminalEventSeen) {
    activeImportChannels.set(job.id, onEvent);
  }
  return job;
}

export async function getAssetImportJob(
  jobId: string
): Promise<AssetImportJob> {
  const job = await invoke<AssetImportJob>("asset_get_import_job", { jobId });
  if (isAssetImportJobTerminal(job)) {
    activeImportChannels.delete(jobId);
  }
  return job;
}

export async function listAssetImportJobs(limit = 20): Promise<AssetImportJob[]> {
  return invoke<AssetImportJob[]>("asset_list_import_jobs", { limit });
}

export async function cancelAssetImportJob(jobId: string): Promise<boolean> {
  return invoke<boolean>("asset_cancel_import_job", { jobId });
}

export async function waitForAssetImportJob(
  initialJob: AssetImportJob,
  options: Pick<AssetImportOptions, "signal" | "pollIntervalMs"> = {}
): Promise<AssetImportJob> {
  let job = initialJob;
  const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 250);
  while (!isAssetImportJobTerminal(job)) {
    if (options.signal?.aborted) {
      await cancelAssetImportJob(job.id);
      activeImportChannels.delete(job.id);
      throw abortError();
    }
    await wait(pollIntervalMs);
    job = await getAssetImportJob(job.id);
  }
  return job;
}

export async function importAssetSources(
  sources: AssetImportSource[],
  options: AssetImportOptions = {}
): Promise<AssetImportResult[]> {
  try {
    const startedJob = await startAssetImportJob(sources, options.onProgress);
    const job = await waitForAssetImportJob(startedJob, options);
    if (job.state === "failed") {
      throw new Error(job.errorCode ?? "ASSET_IMPORT_JOB_FAILED");
    }
    const results = job.results;
    logger.info("资产导入批次完成", {
      jobId: job.id,
      state: job.state,
      total: results.length,
      succeeded: results.filter((result) =>
        ["imported", "deduplicated", "restored"].includes(result.status)
      ).length,
      failed: results.filter((result) => result.status === "failed").length,
      cancelled: results.filter((result) => result.status === "cancelled").length,
    });
    return results;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "资产导入服务不可用",
      showToUser: false,
    });
    throw error;
  }
}

export async function listAssets(
  query: AssetListQuery = {}
): Promise<AssetRecord[]> {
  try {
    return await invoke<AssetRecord[]>("asset_list", { query });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产列表",
      showToUser: false,
    });
    throw error;
  }
}

export async function getAssetDetail(assetId: string): Promise<AssetDetail> {
  try {
    return await invoke<AssetDetail>("asset_get_detail", { assetId });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产详情",
      showToUser: false,
    });
    throw error;
  }
}

export async function getAssetPreviewSource(
  assetId: string
): Promise<AssetPreviewSource> {
  try {
    return await invoke<AssetPreviewSource>("asset_get_preview_source", {
      assetId,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法打开资产预览",
      showToUser: false,
    });
    throw error;
  }
}

export async function revokeAssetPreviewSource(
  previewId: string
): Promise<boolean> {
  try {
    return await invoke<boolean>("asset_revoke_preview_source", {
      previewId,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法关闭资产预览",
      showToUser: false,
    });
    throw error;
  }
}

export async function exportAsset(
  assetId: string,
  destination: string
): Promise<AssetExportResult> {
  try {
    return await invoke<AssetExportResult>("asset_export", {
      assetId,
      destination,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法保存资产原件",
      showToUser: false,
    });
    throw error;
  }
}

export async function shareAsset(assetId: string): Promise<AssetShareResult> {
  try {
    return await invoke<AssetShareResult>("asset_share", { assetId });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法打开系统分享",
      showToUser: false,
    });
    throw error;
  }
}

export async function capturePhoto(): Promise<AssetImportSource | null> {
  try {
    return await invoke<AssetImportSource | null>("asset_capture_photo");
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法打开相机",
      showToUser: false,
    });
    throw error;
  }
}

export async function replaceEntityAssetUsages(
  moduleId: string,
  entityType: string,
  entityId: string,
  usages: AssetUsageInput[]
): Promise<number> {
  try {
    const result = await invoke<{ usageCount: number }>(
      "asset_replace_entity_usages",
      { moduleId, entityType, entityId, usages }
    );
    return result.usageCount;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法同步资产使用关系",
      showToUser: false,
    });
    throw error;
  }
}

export async function analyzeAssetDeletion(
  assetIds: string[]
): Promise<AssetDeleteAnalysis> {
  try {
    return await invoke<AssetDeleteAnalysis>("asset_analyze_delete", {
      assetIds,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法分析资产删除影响",
      showToUser: false,
    });
    throw error;
  }
}

export async function setAssetRetentionPolicy(
  assetIds: string[],
  retentionPolicy: AssetRetentionPolicy
): Promise<number> {
  try {
    const result = await invoke<{ updatedCount: number }>(
      "asset_set_retention_policy",
      { assetIds, retentionPolicy }
    );
    return result.updatedCount;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法更新资产保留策略",
      showToUser: false,
    });
    throw error;
  }
}

export async function setAssetLibraryState(
  assetIds: string[],
  libraryState: AssetLibraryState
): Promise<number> {
  try {
    const result = await invoke<{ updatedCount: number }>(
      "asset_set_library_state",
      { assetIds, libraryState }
    );
    return result.updatedCount;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法更新资产库状态",
      showToUser: false,
    });
    throw error;
  }
}

export async function getAssetLibraryFacets(
  includeHidden = false
): Promise<AssetLibraryFacets> {
  try {
    return await invoke<AssetLibraryFacets>("asset_get_library_facets", {
      includeHidden,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产筛选统计",
      showToUser: false,
    });
    throw error;
  }
}

export async function clearRebuildableAssetCache(
  assetIds?: string[]
): Promise<AssetCacheClearResult> {
  try {
    return await invoke<AssetCacheClearResult>(
      "asset_clear_rebuildable_cache",
      { assetIds }
    );
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法清理资产缓存",
      showToUser: false,
    });
    throw error;
  }
}

export async function deleteAssets(
  assetIds: string[],
  confirmAdvisory = false
): Promise<AssetDeleteResult> {
  try {
    return await invoke<AssetDeleteResult>("asset_delete", {
      assetIds,
      confirmAdvisory,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法删除资产原件",
      showToUser: false,
    });
    throw error;
  }
}

export async function getAssetStorageSummary(): Promise<AssetStorageSummary> {
  try {
    return await invoke<AssetStorageSummary>("asset_get_storage_summary");
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产存储统计",
      showToUser: false,
    });
    throw error;
  }
}

export async function repairAssetLibrary(): Promise<AssetRepairReport> {
  try {
    return await invoke<AssetRepairReport>("asset_repair_library");
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法修复资产库",
      showToUser: false,
    });
    throw error;
  }
}
