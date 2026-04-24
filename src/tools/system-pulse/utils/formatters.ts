// src/tools/system-pulse/utils/formatters.ts

/**
 * 将字节数格式化为人类可读的速率字符串
 * 例如：1536 -> "1.5 KB/s"
 */
export function formatBytesPerSec(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
}

/**
 * 将字节数格式化为存储大小字符串
 * 例如：1073741824 -> "1.0 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 将 MHz 格式化为频率字符串
 * 例如：3600 -> "3.60 GHz"
 */
export function formatFrequency(mhz: number): string {
  if (mhz < 1000) return `${mhz} MHz`;
  return `${(mhz / 1000).toFixed(2)} GHz`;
}

/**
 * 格式化运行时间（秒 -> D:HH:MM:SS）
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 3600));
  const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(hrs.toString().padStart(2, "0"));
  parts.push(mins.toString().padStart(2, "0"));
  parts.push(secs.toString().padStart(2, "0"));

  return parts.join(":");
}

/**
 * 温度颜色（用于 CSS 动态类）
 */
export function tempColor(celsius: number | null): string {
  if (celsius === null) return "var(--el-text-color-secondary)";
  if (celsius >= 80) return "var(--el-color-danger)";
  if (celsius >= 50) return "#fb923c"; // 橙色
  return "var(--el-text-color-primary)";
}

/**
 * 使用率百分比转为条形图颜色
 */
export function usageColor(percent: number): string {
  if (percent >= 90) return "var(--el-color-danger)";
  if (percent >= 70) return "#fb923c";
  return "#4a9eff";
}
