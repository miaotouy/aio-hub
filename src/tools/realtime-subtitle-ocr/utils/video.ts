// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import type { VideoRoi } from "../types";

export const DEFAULT_VIDEO_ROI: VideoRoi = {
  x: 0.05,
  y: 0.68,
  width: 0.9,
  height: 0.25,
};

export function clampVideoRoi(roi: VideoRoi): VideoRoi {
  const x = Math.min(0.99, Math.max(0, roi.x));
  const y = Math.min(0.99, Math.max(0, roi.y));
  const width = Math.min(1 - x, Math.max(0.01, roi.width));
  const height = Math.min(1 - y, Math.max(0.01, roi.height));
  return { x, y, width, height };
}

export function videoRoiToPixels(
  roi: VideoRoi,
  videoWidth: number,
  videoHeight: number
): { x: number; y: number; width: number; height: number } {
  const normalized = clampVideoRoi(roi);
  let x = Math.floor(normalized.x * videoWidth);
  let y = Math.floor(normalized.y * videoHeight);
  let width = Math.floor(normalized.width * videoWidth);
  let height = Math.floor(normalized.height * videoHeight);

  // FFmpeg crop 要求有效的正整数尺寸，且尽量使用偶数尺寸避免编码器问题。
  x = Math.max(0, Math.min(videoWidth - 1, x));
  y = Math.max(0, Math.min(videoHeight - 1, y));
  width = Math.max(1, Math.min(videoWidth - x, width));
  height = Math.max(1, Math.min(videoHeight - y, height));
  if (width > 1 && width % 2) width -= 1;
  if (height > 1 && height % 2) height -= 1;

  return { x, y, width, height };
}

export function calculateVideoFrameCount(
  startMs: number,
  endMs: number,
  intervalMs: number
): number {
  const start = Math.max(0, Math.floor(startMs));
  const end = Math.max(start, Math.floor(endMs));
  const interval = Math.max(1, Math.floor(intervalMs));
  return Math.floor((end - start) / interval) + 1;
}

export function normalizeVideoRange(
  startMs: number,
  endMs: number,
  durationMs: number
): { startMs: number; endMs: number } {
  const duration = Math.max(0, Math.floor(durationMs));
  const start = Math.min(duration, Math.max(0, Math.floor(startMs)));
  const end = Math.min(duration, Math.max(start, Math.floor(endMs)));
  return { startMs: start, endMs: end };
}
