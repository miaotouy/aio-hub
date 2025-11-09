import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";

const cache = reactive(new Map<string, { blobUrl: string; refCount: number }>());

/**
 * 获取给定 appdata:// 路径的 Blob URL
 * 会返回缓存的 URL 或创建新的 URL
 * 管理引用计数
 * @param src appdata:// 路径
 * @returns Blob URL，失败时返回 null
 */
export async function acquireBlobUrl(src: string): Promise<string | null> {
  const cached = cache.get(src);
  if (cached) {
    cached.refCount++;
    return cached.blobUrl;
  }

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
      URL.revokeObjectURL(entry.blobUrl);
      cache.delete(src);
    }
  }
}