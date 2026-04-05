/**
 * 下载历史记录项
 */
export interface DownloadItem {
  id: string;
  filename: string;
  filepath: string;
  size: number;
  timestamp: number;
  status: "success" | "failed" | "pending";
  error?: string;
}

/**
 * 下载事件的标准负载结构
 */
export interface DownloadCompletedPayload {
  id: string; // UUID，下载任务唯一标识
  filename: string; // 文件名
  filepath: string; // 完整保存路径
  size: number; // 文件大小（字节）
  status: "success" | "failed";
  error?: string; // 失败原因（仅当 status='failed' 时）
  timestamp: number; // 完成时间戳
  sourceWindow?: string; // 触发下载的窗口标签（可选，用于调试）
}

/**
 * 全局下载事件常量
 */
export const DOWNLOAD_EVENTS = {
  COMPLETED: "global:download_completed",
  PROGRESS: "global:download_progress", // 预留，用于大文件流式下载
} as const;