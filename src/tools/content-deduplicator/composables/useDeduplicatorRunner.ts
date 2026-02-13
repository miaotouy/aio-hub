import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { useContentDeduplicatorStore } from "../stores/store";
import type { DedupAnalysisResult, DedupScanProgress, DedupDeleteResult } from "../types";

const logger = createModuleLogger("tools/content-deduplicator/runner");
const errorHandler = createModuleErrorHandler("tools/content-deduplicator/runner");

export function useDeduplicatorRunner() {
  const store = useContentDeduplicatorStore();
  let unlistenProgress: UnlistenFn | null = null;
  let unlistenDeleteProgress: UnlistenFn | null = null;

  /** 初始化事件监听 */
  async function initialize() {
    unlistenProgress = await listen<DedupScanProgress>("dedup-scan-progress", (event) => {
      store.scanProgress = event.payload;
    });

    unlistenDeleteProgress = await listen("dedup-delete-progress", () => {
      // 删除进度暂时不做特殊处理，store.isDeleting 已足够
    });

    logger.info("事件监听已初始化");
  }

  /** 清理事件监听 */
  async function dispose() {
    if (unlistenProgress) {
      unlistenProgress();
      unlistenProgress = null;
    }
    if (unlistenDeleteProgress) {
      unlistenDeleteProgress();
      unlistenDeleteProgress = null;
    }
    logger.info("事件监听已清理");
  }

  /** 执行扫描 */
  async function scanDirectory(): Promise<DedupAnalysisResult | null> {
    if (!store.scanPath) {
      customMessage.warning("请先选择扫描路径");
      return null;
    }

    store.isScanning = true;
    store.scanProgress = null;

    const result = await errorHandler.wrapAsync(
      () =>
        invoke<DedupAnalysisResult>("scan_content_duplicates", {
          path: store.scanPath,
          config: store.config,
        }),
      { userMessage: "扫描失败" }
    );

    store.isScanning = false;
    store.scanProgress = null;

    if (result === null) return null;

    store.setResult(result);
    logger.info("扫描完成", {
      groups: result.statistics.totalGroups,
      duplicates: result.statistics.totalDuplicates,
      wasted: result.statistics.totalWastedBytes,
    });

    return result;
  }

  /** 停止扫描 */
  async function stopScan() {
    const result = await errorHandler.wrapAsync(() => invoke("stop_dedup_scan"), {
      userMessage: "停止扫描失败",
    });

    if (result !== null) {
      store.isScanning = false;
      store.scanProgress = null;
      customMessage.success("已停止扫描");
      logger.info("用户手动停止扫描");
    }
  }

  /** 删除选中的重复文件 */
  async function deleteSelected(): Promise<DedupDeleteResult | null> {
    const paths = Array.from(store.selectedPaths);
    if (paths.length === 0) {
      customMessage.warning("请先选择要删除的文件");
      return null;
    }

    store.isDeleting = true;

    const result = await errorHandler.wrapAsync(
      () => invoke<DedupDeleteResult>("delete_duplicate_files", { paths }),
      { userMessage: "删除失败" }
    );

    store.isDeleting = false;

    if (result === null) return null;

    // 从结果中移除已删除的文件
    if (result.successCount > 0) {
      // 只移除成功删除的路径（排除失败的）
      const failedPaths = new Set(
        result.errors
          .map((e) => {
            // 从错误消息中提取路径（格式："移入回收站失败 path: reason"）
            const match = e.match(/移入回收站失败 (.+?):/);
            return match ? match[1] : "";
          })
          .filter(Boolean)
      );
      const successPaths = paths.filter((p) => !failedPaths.has(p));
      store.removeDeletedPaths(successPaths);
    }

    logger.info("删除完成", {
      success: result.successCount,
      errors: result.errorCount,
      freed: result.freedSpace,
    });

    return result;
  }

  /** 读取文件内容（用于 diff 预览） */
  async function readFileForDiff(path: string): Promise<string | null> {
    return errorHandler.wrapAsync(
      () => invoke<string>("read_file_content_for_diff", { path, maxSizeKb: 512 }),
      { userMessage: "读取文件内容失败" }
    );
  }

  return {
    initialize,
    dispose,
    scanDirectory,
    stopScan,
    deleteSelected,
    readFileForDiff,
  };
}
