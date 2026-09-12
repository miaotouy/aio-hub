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

/**
 * 字幕条目的纯编辑操作：拆分 / 合并。
 * 只处理数据，不触碰 Object URL 生命周期，便于单测与复用。
 */

import type { SubtitleEntry } from "../types";

/** 拆分点至少距端点 1ms，避免产生零长或负长条目。 */
const MIN_SEGMENT_MS = 1;

/**
 * 在 `atMs` 处把一条字幕拆成前后两条。
 * 拆分点不在条目内部时返回 `null`。
 */
export function splitSubtitleEntry(
  entry: SubtitleEntry,
  atMs: number,
  newId: string
): [SubtitleEntry, SubtitleEntry] | null {
  const at = Math.round(atMs);
  if (at < entry.startMs + MIN_SEGMENT_MS || at > entry.endMs - MIN_SEGMENT_MS) {
    return null;
  }
  const first: SubtitleEntry = { ...entry, endMs: at };
  const second: SubtitleEntry = { ...entry, id: newId, startMs: at };
  return [first, second];
}

/**
 * 把多条字幕合并为一条，保留最早起点、最晚终点与首条样式属性。
 * 数量不足两条时返回 `null`。
 */
export function mergeSubtitleEntries(
  entries: SubtitleEntry[]
): SubtitleEntry | null {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.startMs - b.startMs);
  const first = sorted[0];
  const text = sorted
    .map((entry) => entry.text.trim())
    .filter((value) => value.length > 0)
    .join(" ");
  const status = sorted.every((entry) => entry.status === "done")
    ? "done"
    : first.status;
  return {
    ...first,
    text,
    startMs: first.startMs,
    endMs: Math.max(...sorted.map((entry) => entry.endMs)),
    status,
  };
}
