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

/** ROI 8 向手柄名称 */
export type RoiHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const CORNER_HANDLES: ReadonlySet<RoiHandle> = new Set([
  "nw",
  "ne",
  "se",
  "sw",
]);

export function isCornerHandle(handle: RoiHandle): boolean {
  return CORNER_HANDLES.has(handle);
}

/**
 * 按手柄拖拽量计算新的归一化 ROI。
 *
 * `dx` / `dy` 为归一化位移。传入手柄为角点且提供 `aspectRatio`
 * （归一化 width / height）时保持比例，锚定对角点。
 */
export function resizeVideoRoi(
  origin: VideoRoi,
  handle: RoiHandle,
  dx: number,
  dy: number,
  minSize = 0.01,
  aspectRatio?: number
): VideoRoi {
  const useLock =
    aspectRatio !== undefined && aspectRatio > 0 && isCornerHandle(handle);

  if (useLock) {
    const k = aspectRatio!;
    const right = origin.x + origin.width;
    const bottom = origin.y + origin.height;
    const handleE = handle.includes("e");
    const handleW = handle.includes("w");
    const handleN = handle.includes("n");

    const horizontalSign = handleE ? 1 : -1;
    const verticalSign = handleN ? -1 : 1;

    // Allow either axis to drive a locked corner resize.
    const widthDelta = horizontalSign * dx;
    const heightDeltaAsWidth = verticalSign * dy * k;
    const delta =
      Math.abs(widthDelta) >= Math.abs(heightDeltaAsWidth)
        ? widthDelta
        : heightDeltaAsWidth;

    // Constrain the size before positioning so the ratio survives frame edges.
    const maxWidthByX = handleE ? 1 - origin.x : right;
    const maxHeightByY = handleN ? bottom : 1 - origin.y;
    const minWidth = Math.max(minSize, minSize * k);
    const maxWidth = Math.min(maxWidthByX, maxHeightByY * k);
    const width = Math.min(maxWidth, Math.max(minWidth, origin.width + delta));
    const height = width / k;

    const x = handleW ? right - width : origin.x;
    const y = handleN ? bottom - height : origin.y;
    return clampVideoRoi({ x, y, width, height });
  }

  let { x, y, width, height } = origin;
  const min = minSize;
  if (handle.includes("n")) {
    const newY = Math.max(
      0,
      Math.min(origin.y + origin.height - min, origin.y + dy)
    );
    height = origin.y + origin.height - newY;
    y = newY;
  }
  if (handle.includes("s")) {
    height = Math.max(min, Math.min(1 - origin.y, origin.height + dy));
  }
  if (handle.includes("w")) {
    const newX = Math.max(
      0,
      Math.min(origin.x + origin.width - min, origin.x + dx)
    );
    width = origin.x + origin.width - newX;
    x = newX;
  }
  if (handle.includes("e")) {
    width = Math.max(min, Math.min(1 - origin.x, origin.width + dx));
  }
  return clampVideoRoi({ x, y, width, height });
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
