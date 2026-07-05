// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 纯算法工具：Levenshtein 编辑距离 + SRT 格式化。
 * 全部为纯函数，无副作用，便于单测。
 */

import type { SubtitleEntry } from "../types";

/**
 * 标准编辑距离（Levenshtein Distance）。
 * 使用一维滚动数组优化空间至 O(min(m,n))。
 */
export function getLevenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // 确保 s1 是较短串以节省空间
  if (len1 < len2) {
    return getLevenshteinDistance(s2, s1);
  }

  let prev = new Array<number>(len2 + 1);
  let curr = new Array<number>(len2 + 1);
  for (let j = 0; j <= len2; j++) prev[j] = j;

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // 删除
        curr[j - 1] + 1, // 插入
        prev[j - 1] + cost // 替换
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[len2];
}

/**
 * 计算两段文本的相似度（0~1）。
 * Similarity = 1 - Levenshtein / max(len1, len2)
 */
export function getSimilarity(s1: string, s2: string): number {
  const t1 = s1.trim();
  const t2 = s2.trim();
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen === 0) return 1;
  return 1 - getLevenshteinDistance(t1, t2) / maxLen;
}

/**
 * 将毫秒时间戳格式化为 SRT 时间码 `HH:MM:SS,mmm`。
 */
export function formatSrtTime(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  const pad = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(
    millis,
    3
  )}`;
}

/**
 * 将字幕列表导出为标准 SRT 字符串。
 */
export function buildSrt(subtitles: SubtitleEntry[]): string {
  return subtitles
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((sub, idx) => {
      const index = idx + 1;
      const start = formatSrtTime(sub.startMs);
      const end = formatSrtTime(sub.endMs);
      return `${index}\n${start} --> ${end}\n${sub.text.trim()}\n`;
    })
    .join("\n");
}

