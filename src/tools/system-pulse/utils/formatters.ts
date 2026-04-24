// src/tools/system-pulse/utils/formatters.ts
import type { SystemSnapshot } from "../types/snapshot";

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

/**
 * 将系统快照格式化为易读的文本报告
 */
export function formatSnapshotToText(snapshot: SystemSnapshot): string {
  const date = new Date(snapshot.timestamp).toLocaleString();
  const memPercent = ((snapshot.memory.usedBytes / snapshot.memory.totalBytes) * 100).toFixed(1);

  const lines = [
    `--- 系统脉搏快照(${date}) ---`,
    `运行时间: ${formatUptime(snapshot.uptime)}`,
    `CPU: ${snapshot.cpu.brand} | 使用率: ${snapshot.cpu.globalUsage.toFixed(1)}% | 频率: ${formatFrequency(
      snapshot.cpu.frequencyMhz,
    )}`,
    `内存: ${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)} (${memPercent}%)`,
  ];

  if (snapshot.gpus.length > 0) {
    snapshot.gpus.forEach((gpu) => {
      lines.push(`GPU[${gpu.index}]: ${gpu.name} | 使用率: ${gpu.usagePercent}% | 温度: ${gpu.temperatureCelsius}°C`);
    });
  }

  lines.push("磁盘状态:");
  snapshot.disks.forEach((disk) => {
    const diskPercent = ((disk.usedBytes / disk.totalBytes) * 100).toFixed(1);
    lines.push(
      `  - ${disk.mountPoint} (${disk.name}): ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)} (${diskPercent}%)`,
    );
  });

  const totalUp = snapshot.networks.reduce((s, n) => s + n.uploadBytesPerSec, 0);
  const totalDown = snapshot.networks.reduce((s, n) => s + n.downloadBytesPerSec, 0);
  lines.push(`网络速率: ↑ ${formatBytesPerSec(totalUp)} | ↓ ${formatBytesPerSec(totalDown)}`);

  return lines.join("\n");
}
