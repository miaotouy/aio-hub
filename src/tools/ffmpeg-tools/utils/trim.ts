// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export interface TrimRangeParams {
  trimStart?: number;
  trimEnd?: number;
  trimMode?: "fast" | "precise";
}

export interface TrimValidation {
  start: number;
  end: number;
  duration: number;
  error?: string;
  warning?: string;
}

const COLON_TIME_PATTERN = /^\d+(\.\d+)?$/;
const PLAIN_TIME_PATTERN = /^-?\d+(\.\d+)?$/;

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

/**
 * 将秒格式化为 `HH:MM:SS.mmm`，毫秒四舍五入并补零。
 */
export function formatTrimTime(seconds: number): string {
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safeSeconds * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

/**
 * 解析 `HH:MM:SS(.ms)`、`MM:SS(.ms)` 或纯秒数，无法解析时返回 `null`。
 */
export function parseTrimTime(input: string): number | null {
  const text = input.trim();
  if (!text) return null;

  const parts = text.split(":");
  if (parts.length > 3) return null;

  if (parts.length === 1) {
    if (!PLAIN_TIME_PATTERN.test(parts[0])) return null;
    const value = Number(parts[0]);
    return Number.isFinite(value) ? value : null;
  }

  if (!parts.every((part) => COLON_TIME_PATTERN.test(part.trim()))) {
    return null;
  }

  let total = 0;
  for (const part of parts) {
    total = total * 60 + Number(part);
  }
  return total;
}

export function hasTrimRange(params: {
  trimStart?: number;
  trimEnd?: number;
}): boolean {
  const hasStart = params.trimStart != null && params.trimStart > 0;
  const hasEnd = params.trimEnd != null && params.trimEnd > 0;
  return hasStart || hasEnd;
}

export function validateTrimRange(
  params: TrimRangeParams,
  sourceDuration?: number,
  hasVideo?: boolean
): TrimValidation {
  const start = Math.max(0, params.trimStart ?? 0);
  const end = params.trimEnd ?? sourceDuration ?? 0;
  const duration = end - start;

  const result: TrimValidation = { start, end, duration };

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    result.error = "时间必须为有效数字";
    return result;
  }

  if (start < 0) {
    result.error = "开始时间不能为负";
    return result;
  }

  if (end === start) {
    result.error = "裁剪时长必须大于零";
    return result;
  }

  if (end < start) {
    result.error = "结束时间必须大于开始时间";
    return result;
  }

  if (sourceDuration != null && end > sourceDuration + 0.001) {
    result.warning = "结束时间超出源时长，将按源结尾截取";
  } else if (hasVideo === false && params.trimMode === "fast") {
    result.warning = "音频流拷贝裁剪按关键帧/时间基执行，不保证精确到毫秒";
  }

  return result;
}

export function snapToKeyframe(
  time: number,
  keyframes: number[],
  direction: "nearest" | "forward" | "backward"
): number {
  if (!Number.isFinite(time) || keyframes.length === 0) {
    return time;
  }

  if (direction === "forward") {
    const candidate = keyframes.find((keyframe) => keyframe >= time);
    return candidate ?? time;
  }

  if (direction === "backward") {
    let candidate: number | undefined;
    for (const keyframe of keyframes) {
      if (keyframe <= time) candidate = keyframe;
    }
    return candidate ?? time;
  }

  let nearest = keyframes[0];
  let minDiff = Math.abs(nearest - time);
  for (const keyframe of keyframes) {
    const diff = Math.abs(keyframe - time);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = keyframe;
    }
  }
  return nearest;
}

export function trimNameTag(params: {
  trimStart?: number;
  trimEnd?: number;
}): string {
  return hasTrimRange(params) ? "_trim" : "";
}
