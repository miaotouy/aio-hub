// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { resolveMediaSource } from "@/utils/mediaSource";

/** 从可播放媒体地址读取一帧；结束、错误和超时均释放媒体与文件授权。 */
export async function generateVideoThumbnail(
  videoUrl: string
): Promise<string> {
  const lease = await resolveMediaSource(videoUrl);
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let finished = false;
    const timeout = setTimeout(
      () => finish(new Error("生成缩略图超时")),
      10000
    );
    function finish(error?: unknown, image?: string) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      video.onloadedmetadata =
        video.onloadeddata =
        video.onseeked =
        video.onerror =
          null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      void lease.release();
      if (error) reject(error);
      else resolve(image!);
    }
    function capture() {
      if (finished || video.readyState < 2 || video.seeking) return;
      try {
        const scale = Math.min(
          1,
          400 / Math.max(video.videoWidth, video.videoHeight)
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建视频缩略图画布");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(undefined, canvas.toDataURL("image/jpeg", 0.7));
      } catch (error) {
        finish(error);
      }
    }
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      video.currentTime = video.duration > 1 ? 1 : video.duration / 2;
    };
    video.onloadeddata = capture;
    video.onseeked = capture;
    video.onerror = () => finish(new Error("无法读取视频缩略图"));
    video.src = lease.url;
  });
}
