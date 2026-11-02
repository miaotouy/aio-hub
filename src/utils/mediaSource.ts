// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { invoke, isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { fileUriToPath } from "@/utils/fileDropPaths";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("MediaSource");

export interface MediaSourceLease {
  url: string;
  release: () => Promise<void>;
}

/** 仅将 Linux 本地文件 URL 交给流式媒体入口；网络、Blob 和其他平台保持原地址。 */
export function getStreamingMediaPath(source: string): string | null {
  try {
    if (!isTauri() || platform() !== "linux") return null;
    const url = new URL(source);
    if (url.protocol === "file:") return fileUriToPath(source);
    if (url.protocol !== "asset:" || url.hostname !== "localhost") return null;
    const path = decodeURIComponent(url.pathname.slice(1));
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return null;
  }
}

export async function resolveMediaSource(
  source: string
): Promise<MediaSourceLease> {
  const path = getStreamingMediaPath(source);
  if (path === null) return { url: source, release: async () => {} };
  const lease = await invoke<{ token: string; url: string }>(
    "acquire_media_stream",
    { path }
  );
  let released = false;
  return {
    url: lease.url,
    async release() {
      if (released) return;
      released = true;
      try {
        await invoke("release_media_stream", { token: lease.token });
      } catch (error) {
        logger.warn("释放媒体读取失败", error);
      }
    },
  };
}
