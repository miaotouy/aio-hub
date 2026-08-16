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

export type VcpBlockBoundary =
  | { status: "complete"; endIndex: number }
  | { status: "interrupted"; nextStartIndex: number }
  | { status: "unclosed" };

export interface FindVcpBlockBoundaryOptions {
  endMarker: string;
  /**
   * A marker that appears before this block's end marker proves that the
   * current block is malformed. Callers can then resume scanning at it.
   */
  recoveryStartMarkers: readonly string[];
}

// 参数值转义围栏（VCPToolBox 的 ESCAPED_LITERAL_MAP 语义）：
// 「始ESCAPE」...「末ESCAPE」内的协议字符（含请求块标记）属于转义内容，
// 扫描块边界时必须整段跳过，否则嵌套块会被误判为坏块。
const ESCAPE_FENCE_START = "「始ESCAPE」";
const ESCAPE_FENCE_END = "「末ESCAPE」";

/**
 * Find a VCP block's end while preventing an unclosed block from consuming a
 * later valid request block. The caller controls which nested start markers
 * are valid for its block type through `recoveryStartMarkers`.
 *
 * ESCAPE-fenced regions (`「始ESCAPE」...「末ESCAPE」`) are skipped entirely:
 * markers inside them are escaped content and must not affect boundary
 * decisions (mirrors VCPToolBox's `_findBlockEnd`).
 */
export function findVcpBlockBoundary(
  text: string,
  contentStart: number,
  options: FindVcpBlockBoundaryOptions
): VcpBlockBoundary {
  let cursor = contentStart;

  while (cursor < text.length) {
    const fenceStart = text.indexOf(ESCAPE_FENCE_START, cursor);
    let endIndex = text.indexOf(options.endMarker, cursor);
    let nextStartIndex = -1;

    for (const startMarker of options.recoveryStartMarkers) {
      const candidateIndex = text.indexOf(startMarker, cursor);
      if (
        candidateIndex !== -1 &&
        (nextStartIndex === -1 || candidateIndex < nextStartIndex)
      ) {
        nextStartIndex = candidateIndex;
      }
    }

    // 转义围栏起点出现在任何边界标记之前：跳过整个围栏区域再继续扫描
    if (
      fenceStart !== -1 &&
      (endIndex === -1 || fenceStart < endIndex) &&
      (nextStartIndex === -1 || fenceStart < nextStartIndex)
    ) {
      const fenceEnd = text.indexOf(
        ESCAPE_FENCE_END,
        fenceStart + ESCAPE_FENCE_START.length
      );
      if (fenceEnd === -1) {
        // 转义围栏未闭合：其余内容均属转义内容，找不到可靠边界
        return { status: "unclosed" };
      }
      cursor = fenceEnd + ESCAPE_FENCE_END.length;
      continue;
    }

    if (nextStartIndex !== -1 && (endIndex === -1 || nextStartIndex < endIndex)) {
      return { status: "interrupted", nextStartIndex };
    }

    if (endIndex === -1) {
      return { status: "unclosed" };
    }

    return { status: "complete", endIndex };
  }

  return { status: "unclosed" };
}
