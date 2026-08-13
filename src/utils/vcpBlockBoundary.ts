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

/**
 * Find a VCP block's end while preventing an unclosed block from consuming a
 * later valid request block. The caller controls which nested start markers
 * are valid for its block type through `recoveryStartMarkers`.
 */
export function findVcpBlockBoundary(
  text: string,
  contentStart: number,
  options: FindVcpBlockBoundaryOptions
): VcpBlockBoundary {
  const endIndex = text.indexOf(options.endMarker, contentStart);
  let nextStartIndex = -1;

  for (const startMarker of options.recoveryStartMarkers) {
    const candidateIndex = text.indexOf(startMarker, contentStart);
    if (
      candidateIndex !== -1 &&
      (nextStartIndex === -1 || candidateIndex < nextStartIndex)
    ) {
      nextStartIndex = candidateIndex;
    }
  }

  if (nextStartIndex !== -1 && (endIndex === -1 || nextStartIndex < endIndex)) {
    return { status: "interrupted", nextStartIndex };
  }

  if (endIndex === -1) {
    return { status: "unclosed" };
  }

  return { status: "complete", endIndex };
}
