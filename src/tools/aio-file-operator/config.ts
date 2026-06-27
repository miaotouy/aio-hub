/**
 * aio-file-operator 默认配置
 */
import type { AioFileOperatorConfig } from "./types";

/** 默认允许的沙箱目录（用户可配置） */
export const DEFAULT_ALLOWED_DIRECTORIES: string[] = [
  // 桌面
  "Desktop",
  // 文档
  "Documents",
  // 下载
  "Downloads",
];

/** 默认最大文件大小：10MB */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 默认配置 */
export const DEFAULT_CONFIG: AioFileOperatorConfig = {
  allowedDirectories: DEFAULT_ALLOWED_DIRECTORIES,
  blackListRules: [],
  sandboxMode: "whitelist",
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  enableAuditLog: true,
  overwritePolicy: "follow",
};
