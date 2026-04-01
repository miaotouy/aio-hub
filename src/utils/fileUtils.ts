/**
 * 清理文件名，移除 Windows/Linux/macOS 下的无效字符
 */
export const sanitizeFilename = (name: string): string => {
  // 替换所有非法字符为下划线，包括控制字符和一些特殊符号
  // Windows 非法字符: \ / : * ? " < > |
  return name
    .replace(/[\\/:*?"<>|\x00-\x1f\x80-\x9f]/g, "_")
    .replace(/\u3000/g, "_") // 替换全角空格
    .replace(/\.+$/g, "") // 移除末尾的点
    .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i, "_$1") // 避开 Windows 保留文件名
    .trim();
};

/**
 * 格式化字节大小为人类可读格式
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};
