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
