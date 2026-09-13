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
 * 字幕时间轴 store 工厂。
 *
 * 屏幕实时监控与本地视频 OCR 各自持有一份独立实例，避免两条流水线
 * 共用同一份字幕列表而互相清空或误合并。所有状态与操作都封装在工厂内，
 * 不依赖任何模块级单例。
 */

import { ref } from "vue";
import type { Ref } from "vue";
import type { SubtitleEntry } from "../types";
import { buildSrt, formatSrtTime } from "../utils/algorithms";
import { mergeSubtitleEntries, splitSubtitleEntry } from "../utils/subtitleOps";

export interface SubtitleTimelineStore {
  subtitles: Ref<SubtitleEntry[]>;
  addSubtitle: (entry: SubtitleEntry) => void;
  replaceSubtitle: (id: string, patch: Partial<SubtitleEntry>) => void;
  splitSubtitle: (id: string, atMs: number) => string | null;
  mergeSubtitles: (ids: string[]) => string | null;
  removeSubtitle: (id: string) => void;
  clearSubtitles: () => void;
  updateSubtitleText: (id: string, text: string) => void;
  registerFrameUrl: (url: string) => void;
  clearFrameUrl: (url: string) => void;
  revokeAllFrameUrls: () => void;
  exportPlainText: () => string;
  exportTextWithTime: () => string;
  exportSrt: () => string;
  downloadSrt: (filename?: string) => void;
}

export function createSubtitleTimelineStore(): SubtitleTimelineStore {
  const subtitles = ref<SubtitleEntry[]>([]);
  const frameUrls = new Set<string>();

  function registerFrameUrl(url: string) {
    frameUrls.add(url);
  }

  function clearFrameUrl(url: string) {
    if (frameUrls.delete(url)) {
      URL.revokeObjectURL(url);
    }
  }

  function revokeAllFrameUrls() {
    for (const url of frameUrls) {
      URL.revokeObjectURL(url);
    }
    frameUrls.clear();
  }

  function removeSubtitle(id: string) {
    const target = subtitles.value.find((subtitle) => subtitle.id === id);
    subtitles.value = subtitles.value.filter((subtitle) => subtitle.id !== id);
    if (target?.frameUrl) clearFrameUrl(target.frameUrl);
  }

  function clearSubtitles() {
    subtitles.value = [];
    revokeAllFrameUrls();
  }

  function updateSubtitleText(id: string, text: string) {
    const target = subtitles.value.find((subtitle) => subtitle.id === id);
    if (target) target.text = text;
  }

  function addSubtitle(entry: SubtitleEntry) {
    subtitles.value.push(entry);
  }

  function replaceSubtitle(id: string, patch: Partial<SubtitleEntry>) {
    const target = subtitles.value.find((subtitle) => subtitle.id === id);
    if (target) Object.assign(target, patch);
  }

  /** 在 `atMs` 处拆分字幕；拆分点无效时返回 `null`。 */
  function splitSubtitle(id: string, atMs: number): string | null {
    const index = subtitles.value.findIndex((subtitle) => subtitle.id === id);
    if (index === -1) return null;
    const original = subtitles.value[index];
    const newId = `subtitle-split-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const parts = splitSubtitleEntry(original, atMs, newId);
    if (!parts) return null;
    const [first, second] = parts;
    // 第二段不复用第一段的 Object URL，避免任一删除时提前释放导致另一段预览失效。
    second.frameUrl = undefined;
    subtitles.value.splice(index, 1, first, second);
    return newId;
  }

  /** 合并若干字幕为一条，返回合并后条目 id；不足两条时返回 `null`。 */
  function mergeSubtitles(ids: string[]): string | null {
    const targets = ids
      .map((id) => subtitles.value.find((subtitle) => subtitle.id === id))
      .filter((entry): entry is SubtitleEntry => Boolean(entry));
    const merged = mergeSubtitleEntries(targets);
    if (!merged) return null;
    const keepId = merged.id;
    for (const entry of targets) {
      if (entry.id !== keepId && entry.frameUrl) {
        clearFrameUrl(entry.frameUrl);
      }
    }
    const mergedIds = new Set(targets.map((entry) => entry.id));
    const mergedEntries = subtitles.value.filter(
      (subtitle) => !mergedIds.has(subtitle.id)
    );
    mergedEntries.push(merged);
    mergedEntries.sort((a, b) => a.startMs - b.startMs);
    subtitles.value = mergedEntries;
    return keepId;
  }

  /** 复制全部字幕纯文本 */
  function exportPlainText(): string {
    return subtitles.value.map((subtitle) => subtitle.text.trim()).join("\n");
  }

  /** 导出带时间的字幕文本 */
  function exportTextWithTime(): string {
    return subtitles.value
      .map((subtitle) => {
        const start = formatSrtTime(subtitle.startMs);
        const end = formatSrtTime(subtitle.endMs);
        return `[${start} --> ${end}] ${subtitle.text.trim()}`;
      })
      .join("\n");
  }

  /** 导出 SRT 字符串 */
  function exportSrt(): string {
    return buildSrt(subtitles.value);
  }

  /** 触发浏览器下载 SRT 文件 */
  function downloadSrt(filename = "subtitles.srt") {
    const srt = exportSrt();
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    subtitles,
    addSubtitle,
    replaceSubtitle,
    splitSubtitle,
    mergeSubtitles,
    removeSubtitle,
    clearSubtitles,
    updateSubtitleText,
    registerFrameUrl,
    clearFrameUrl,
    revokeAllFrameUrls,
    exportPlainText,
    exportTextWithTime,
    exportSrt,
    downloadSrt,
  };
}
