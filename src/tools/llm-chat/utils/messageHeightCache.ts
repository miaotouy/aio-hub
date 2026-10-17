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

import { layout, prepare, type PreparedText } from "@chenglou/pretext";

export const DEFAULT_MESSAGE_HEIGHT = 500;

export interface MessageHeightKey {
  id: string;
  content: string;
  revision: string;
  appearance: string;
  width: number;
}

export interface MessageTextMetrics {
  font: string;
  letterSpacing: number;
  lineHeight: number;
  width: number;
  chromeHeight: number;
  paragraphGap: number;
  minHeight: number;
}

/** 只预测普通段落；结构化内容交给实际渲染后的整行测量。 */
export function isPlainMessageText(text: string): boolean {
  return (
    text.trim().length > 0 &&
    text.length <= 16_000 &&
    !/[`*_~<>\[\]{}\\|$]/.test(text) &&
    !/^(?: {4}|\t| {0,3}(?:#{1,6}\s|>\s?|[-+]\s|\d+[.)]\s|[-=]{3,}\s*$))/m.test(
      text
    )
  );
}

function matches(a: MessageHeightKey, b: MessageHeightKey): boolean {
  return (
    a.content === b.content &&
    a.revision === b.revision &&
    a.appearance === b.appearance &&
    a.width === b.width
  );
}

/** 每个列表独立持有、有界的会话内存缓存。宽度变化只重排已准备的文本。 */
export class MessageHeightCache {
  private measured = new Map<
    string,
    { key: MessageHeightKey; height: number }
  >();
  private prepared = new Map<
    string,
    {
      text: string;
      font: string;
      letterSpacing: number;
      paragraphs: PreparedText[];
    }
  >();

  constructor(private readonly capacity = 256) {}

  read(key: MessageHeightKey): number | undefined {
    const entry = this.measured.get(key.id);
    if (!entry || !matches(entry.key, key)) return;
    this.measured.delete(key.id);
    this.measured.set(key.id, entry);
    return entry.height;
  }

  remember(key: MessageHeightKey, height: number): void {
    if (!Number.isFinite(height) || height <= 0 || key.width <= 0) return;
    this.measured.delete(key.id);
    this.measured.set(key.id, { key, height });
    this.trim(this.measured);
  }

  estimate(
    id: string,
    text: string,
    metrics: MessageTextMetrics
  ): number | undefined {
    if (!isPlainMessageText(text) || metrics.width <= 0) return;
    let entry = this.prepared.get(id);
    if (
      !entry ||
      entry.text !== text ||
      entry.font !== metrics.font ||
      entry.letterSpacing !== metrics.letterSpacing
    ) {
      entry = {
        text,
        font: metrics.font,
        letterSpacing: metrics.letterSpacing,
        paragraphs: text
          .trim()
          .split(/\r?\n\s*\r?\n/)
          .map((paragraph) =>
            prepare(paragraph, metrics.font, {
              whiteSpace: "pre-wrap",
              letterSpacing: metrics.letterSpacing,
            })
          ),
      };
    }
    this.prepared.delete(id);
    this.prepared.set(id, entry);
    this.trim(this.prepared);
    const height = entry.paragraphs.reduce(
      (total, paragraph) =>
        total + layout(paragraph, metrics.width, metrics.lineHeight).height,
      0
    );
    return Math.max(
      metrics.minHeight,
      Math.ceil(
        height +
          metrics.chromeHeight +
          (entry.paragraphs.length - 1) * metrics.paragraphGap
      )
    );
  }

  invalidate(id: string): void {
    this.measured.delete(id);
  }

  clear(): void {
    this.measured.clear();
    this.prepared.clear();
  }

  private trim<T>(entries: Map<string, T>): void {
    while (entries.size > this.capacity)
      entries.delete(entries.keys().next().value!);
  }
}
