import { createConfigManager } from "./configManager";
import type { DownloadItem } from "@/types/download";

/**
 * 下载历史数据结构
 */
export interface DownloadHistory {
  history: DownloadItem[];
  version: string;
}

/**
 * 默认下载历史
 */
export const defaultDownloadHistory: DownloadHistory = {
  history: [],
  version: "1.0.0",
};

/**
 * 下载历史管理器
 * 使用通用 ConfigManager 实现持久化
 */
export const downloadHistoryManager = createConfigManager<DownloadHistory>({
  moduleName: "downloads",
  fileName: "history.json",
  version: "1.0.0",
  createDefault: () => defaultDownloadHistory,
});