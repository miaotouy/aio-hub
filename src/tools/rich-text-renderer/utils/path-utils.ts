import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 判断是否为本地绝对路径 (Windows 盘符, UNC 路径, 或 Unix / 开头)
 */
export function isLocalPath(path: string): boolean {
  if (!path) return false;
  // Windows 盘符路径 (如 G:\ 或 C:/)
  if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
  // Unix/Linux/macOS 绝对路径 (以 / 开头且不包含协议)
  if (path.startsWith("/") && !path.includes("://")) return true;
  // UNC 路径
  if (path.startsWith("\\\\")) return true;
  // file:// 协议
  if (path.startsWith("file://")) return true;
  return false;
}

/**
 * 将本地路径转换为 Tauri 安全的 asset 协议 URL
 * 处理了 file:// 协议、URL 编码以及 Windows 反斜杠兼容性
 */
export function resolveLocalPath(path: string): string {
  if (!isLocalPath(path)) return path;

  // 1. 处理 file:// 协议前缀
  let cleanPath = path.replace(/^file:\/{2,3}/, "");

  // 2. 解码 URL 编码的字符
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch (e) {
    // 忽略解码失败
  }

  // 3. 转换为 Tauri 安全 URL (asset://)
  let result = convertFileSrc(cleanPath);

  // 4. 处理 Tauri asset 协议对反斜杠的敏感性 (Windows 路径兼容)
  if (result.includes("asset.localhost") || result.startsWith("asset:")) {
    result = result.replace(/\\/g, "/");
  }

  return result;
}
