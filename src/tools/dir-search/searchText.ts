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

/** Search offsets count Unicode scalar values; DOM/Monaco columns count UTF-16 units. */
export function sliceSearchText(
  text: string,
  start?: number,
  end?: number
): string {
  return Array.from(text).slice(start, end).join("");
}

const SEARCH_PREVIEW_CHAR_WIDTH = 7.2;
const DEFAULT_SEARCH_PREVIEW_CONTEXT_CHARS = 60;

function displayUnits(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  const isWide =
    (codePoint >= 0x1100 &&
      (codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
        (codePoint >= 0x3040 && codePoint <= 0xa4cf) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6))) ||
    codePoint >= 0x1f300;
  return isWide ? 2 : 1;
}

/**
 * 根据结果行的可视宽度，返回围绕命中词的安全裁剪范围。
 * 全角字符在等宽字体中通常占两个字符位，直接按 JS 字符数裁剪会把命中词裁到视口外。
 */
export function getSearchPreviewRange(
  text: string,
  matchStart: number,
  matchEnd: number,
  width: number
): { start: number; end: number } {
  const characters = Array.from(text);
  if (
    !Number.isInteger(matchStart) ||
    !Number.isInteger(matchEnd) ||
    matchStart < 0 ||
    matchStart > matchEnd ||
    matchEnd > characters.length
  ) {
    return { start: 0, end: characters.length };
  }

  if (!Number.isFinite(width) || width <= 0) {
    return {
      start: Math.max(0, matchStart - DEFAULT_SEARCH_PREVIEW_CONTEXT_CHARS),
      end: Math.min(
        characters.length,
        matchEnd + DEFAULT_SEARCH_PREVIEW_CONTEXT_CHARS
      ),
    };
  }

  // 为两侧省略号预留字符位，并以命中词为中心向两侧扩展。
  let remainingUnits = Math.max(
    0,
    Math.floor(width / SEARCH_PREVIEW_CHAR_WIDTH) -
      (matchStart > 0 ? 1 : 0) -
      (matchEnd < characters.length ? 1 : 0)
  );
  for (let i = matchStart; i < matchEnd; i++) {
    remainingUnits -= displayUnits(characters[i]);
  }

  let start = matchStart;
  let end = matchEnd;
  let beforeUnits = 0;
  let afterUnits = 0;

  while (remainingUnits > 0 && (start > 0 || end < characters.length)) {
    const canTakeBefore = start > 0;
    const canTakeAfter = end < characters.length;
    const takeBefore =
      canTakeBefore && (!canTakeAfter || beforeUnits <= afterUnits);
    const index = takeBefore ? start - 1 : end;
    const units = displayUnits(characters[index]);
    if (units > remainingUnits) break;

    if (takeBefore) {
      start--;
      beforeUnits += units;
    } else {
      end++;
      afterUnits += units;
    }
    remainingUnits -= units;
  }

  return { start, end };
}

export function searchMatchColumns(
  text: string,
  match: { matchStart: number; matchEnd: number }
) {
  const characters = Array.from(text);
  const { matchStart, matchEnd } = match;
  if (
    !Number.isInteger(matchStart) ||
    !Number.isInteger(matchEnd) ||
    matchStart < 0 ||
    matchStart > matchEnd ||
    matchEnd > characters.length
  )
    return null;
  return {
    startColumn: characters.slice(0, matchStart).join("").length + 1,
    endColumn: characters.slice(0, matchEnd).join("").length + 1,
  };
}
