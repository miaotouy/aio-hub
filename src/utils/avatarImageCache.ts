import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";

const cache = reactive(
  new Map<
    string,
    { blobUrl: string; refCount: number; timeoutId?: ReturnType<typeof setTimeout> }
  >()
);

const CACHE_EXPIRATION_MS = 30000; // 30秒缓存过期时间

/**
 * 同步尝试获取已缓存的 Blob URL
 * 如果缓存命中，会增加引用计数并取消待删除定时器
 */
export function acquireBlobUrlSync(src: string): string | null {
  const cached = cache.get(src);
  if (cached) {
    // 如果有待删除定时器，取消它
    if (cached.timeoutId) {
      clearTimeout(cached.timeoutId);
      cached.timeoutId = undefined;
    }
    cached.refCount++;
    return cached.blobUrl;
  }
  return null;
}

/**
 * 获取给定 appdata:// 路径的 Blob URL
 * 会返回缓存的 URL 或创建新的 URL
 * 管理引用计数
 * @param src appdata:// 路径
 * @returns Blob URL，失败时返回 null
 */
export async function acquireBlobUrl(src: string): Promise<string | null> {
  // 先尝试同步获取
  const syncUrl = acquireBlobUrlSync(src);
  if (syncUrl) return syncUrl;

  try {
    let bytes: number[];

    if (src.startsWith("appdata://")) {
      // 处理 appdata:// 协议，调用专用的资产读取命令
      const relativePath = src.substring(10).replace(/\\/g, "/");
      // 使用新的独立于资产系统的二进制文件读取命令
      bytes = await invoke<number[]>("read_app_data_file_binary", {
        relativePath,
      });
    } else {
      // 处理本地绝对路径（例如 C:\... 或 \\...）
      // 调用通用的二进制文件读取命令
      bytes = await invoke<number[]>("read_file_binary", {
        path: src,
      });
    }

    const uint8Array = new Uint8Array(bytes);
    const blob = new Blob([uint8Array]);
    const blobUrl = URL.createObjectURL(blob);
    cache.set(src, { blobUrl, refCount: 1 });
    return blobUrl;
  } catch (error) {
    console.error(`[AvatarImageCache] Failed to load asset from ${src}`, error);
    return null;
  }
}

/**
 * 释放 Blob URL，减少引用计数
 * 当计数降至零时，URL 会被撤销并从缓存中移除
 * @param src 用于获取 URL 的 appdata:// 路径
 */
export function releaseBlobUrl(src: string) {
  const entry = cache.get(src);
  if (entry) {
    entry.refCount--;
    if (entry.refCount <= 0) {
      // 不要立即删除，而是设置定时器
      if (entry.timeoutId) clearTimeout(entry.timeoutId);

      entry.timeoutId = setTimeout(() => {
        // 再次检查引用计数（防止在定时器期间又被引用了）
        if (entry.refCount <= 0) {
          URL.revokeObjectURL(entry.blobUrl);
          cache.delete(src);
        }
      }, CACHE_EXPIRATION_MS);
    }
  }
}