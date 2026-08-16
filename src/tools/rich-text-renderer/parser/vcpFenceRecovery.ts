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

import {
  findVcpBlockBoundary,
  type FindVcpBlockBoundaryOptions,
  type VcpBlockBoundary,
} from "@/utils/vcpBlockBoundary";

const ESCAPE_FENCE_START = "「始ESCAPE」";
const ESCAPE_FENCE_END = "「末ESCAPE」";
const STANDARD_FENCE_START = "「始」";
const STANDARD_FENCE_END = "「末」";
const EXP_FENCE_START = "「始exp」";
const EXP_FENCE_END = "「末exp」";
const FIELD_KEY_RE = /^[a-zA-Z0-9_-]+/;

export interface VcpFenceRecovery {
  kind: "escape-closed-by-standard-end";
  malformedStartIndex: number;
  malformedEndIndex: number;
  message: string;
}

export type RenderableVcpBlockBoundary =
  | VcpBlockBoundary
  | { status: "complete"; endIndex: number; recovery: VcpFenceRecovery };

function skipWhitespace(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

/**
 * 校验错误闭合候选之后是否只剩完整 VCP 字段。
 *
 * 该校验是显示侧启发式恢复的关键门禁：正文里孤立出现的 `「末」`
 * 不足以触发修复，只有它能让剩余内容完整收敛到外层工具块结束标记时才接受。
 */
function isCompleteFieldSuffix(suffix: string): boolean {
  let cursor = skipWhitespace(suffix, 0);

  if (suffix[cursor] === ",") {
    cursor = skipWhitespace(suffix, cursor + 1);
  }

  while (cursor < suffix.length) {
    const keyMatch = FIELD_KEY_RE.exec(suffix.slice(cursor));
    if (!keyMatch) return false;

    cursor += keyMatch[0].length;
    cursor = skipWhitespace(suffix, cursor);
    if (suffix[cursor] !== ":") return false;

    cursor = skipWhitespace(suffix, cursor + 1);

    let endMarker: string;
    if (suffix.startsWith(ESCAPE_FENCE_START, cursor)) {
      cursor += ESCAPE_FENCE_START.length;
      endMarker = ESCAPE_FENCE_END;
    } else if (suffix.startsWith(EXP_FENCE_START, cursor)) {
      cursor += EXP_FENCE_START.length;
      endMarker = EXP_FENCE_END;
    } else if (suffix.startsWith(STANDARD_FENCE_START, cursor)) {
      cursor += STANDARD_FENCE_START.length;
      endMarker = STANDARD_FENCE_END;
    } else {
      return false;
    }

    const endIndex = suffix.indexOf(endMarker, cursor);
    if (endIndex === -1) return false;

    cursor = skipWhitespace(suffix, endIndex + endMarker.length);
    if (suffix[cursor] === ",") {
      cursor = skipWhitespace(suffix, cursor + 1);
    }
  }

  return true;
}

function findFirstUnclosedEscapeStart(
  text: string,
  contentStart: number
): number {
  let cursor = contentStart;

  while (cursor < text.length) {
    const startIndex = text.indexOf(ESCAPE_FENCE_START, cursor);
    if (startIndex === -1) return -1;

    const endIndex = text.indexOf(
      ESCAPE_FENCE_END,
      startIndex + ESCAPE_FENCE_START.length
    );
    if (endIndex === -1) return startIndex;

    cursor = endIndex + ESCAPE_FENCE_END.length;
  }

  return -1;
}

function findRecoveryCandidates(
  text: string,
  valueStart: number,
  blockEnd: number
): number[] {
  const candidates: number[] = [];
  let depth = 0;
  let cursor = valueStart;

  while (cursor < blockEnd) {
    const nextStart = text.indexOf(STANDARD_FENCE_START, cursor);
    const nextEnd = text.indexOf(STANDARD_FENCE_END, cursor);

    if (
      nextEnd === -1 ||
      nextEnd >= blockEnd ||
      (nextStart !== -1 && nextStart < nextEnd && nextStart < blockEnd)
    ) {
      if (nextStart === -1 || nextStart >= blockEnd) break;
      depth += 1;
      cursor = nextStart + STANDARD_FENCE_START.length;
      continue;
    }

    if (depth > 0) {
      depth -= 1;
    } else if (
      isCompleteFieldSuffix(
        text.slice(nextEnd + STANDARD_FENCE_END.length, blockEnd)
      )
    ) {
      candidates.push(nextEnd);
    }

    cursor = nextEnd + STANDARD_FENCE_END.length;
  }

  return candidates;
}

/**
 * 富文本渲染专用的 VCP 块边界恢复。
 *
 * 工具执行协议仍使用严格的 `findVcpBlockBoundary()`；这里仅在严格解析判定
 * 未闭合后，尝试把 `「始ESCAPE」...「末」` 识别为模型误写，并要求候选之后
 * 的剩余文本能够完整解析为 VCP 字段，防止正文中的普通围栏被误截断。
 */
export function findRenderableVcpBlockBoundary(
  text: string,
  contentStart: number,
  options: FindVcpBlockBoundaryOptions,
  fuzzyModeEnabled = true
): RenderableVcpBlockBoundary {
  const strictBoundary = findVcpBlockBoundary(text, contentStart, options);
  if (strictBoundary.status !== "unclosed" || !fuzzyModeEnabled) {
    return strictBoundary;
  }

  const malformedStartIndex = findFirstUnclosedEscapeStart(text, contentStart);
  if (malformedStartIndex === -1) {
    return strictBoundary;
  }

  const valueStart = malformedStartIndex + ESCAPE_FENCE_START.length;
  let blockEnd = text.indexOf(options.endMarker, valueStart);

  while (blockEnd !== -1) {
    const candidates = findRecoveryCandidates(text, valueStart, blockEnd);
    if (candidates.length === 1) {
      return {
        status: "complete",
        endIndex: blockEnd,
        recovery: {
          kind: "escape-closed-by-standard-end",
          malformedStartIndex,
          malformedEndIndex: candidates[0],
          message:
            "检测到「始ESCAPE」使用了普通「末」闭合；当前仅修复显示，工具执行仍按严格协议处理。",
        },
      };
    }

    if (candidates.length > 1) {
      return strictBoundary;
    }

    blockEnd = text.indexOf(
      options.endMarker,
      blockEnd + options.endMarker.length
    );
  }

  return strictBoundary;
}

export function repairVcpContentForRendering(
  content: string,
  contentStart: number,
  recovery?: VcpFenceRecovery
): string {
  if (!recovery) return content;

  const relativeEndIndex = recovery.malformedEndIndex - contentStart;
  if (
    relativeEndIndex < 0 ||
    !content.startsWith(STANDARD_FENCE_END, relativeEndIndex)
  ) {
    return content;
  }

  return (
    content.slice(0, relativeEndIndex) +
    ESCAPE_FENCE_END +
    content.slice(relativeEndIndex + STANDARD_FENCE_END.length)
  );
}
