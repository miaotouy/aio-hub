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

export interface PromptInsertionResult {
  value: string;
  cursor: number;
}

export function insertPromptAtSelection(
  value: string,
  insertion: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined
): PromptInsertionResult {
  const validStart =
    typeof selectionStart === "number" &&
    Number.isFinite(selectionStart) &&
    selectionStart >= 0 &&
    selectionStart <= value.length;
  const validEnd =
    typeof selectionEnd === "number" &&
    Number.isFinite(selectionEnd) &&
    selectionEnd >= 0 &&
    selectionEnd <= value.length;
  if (!validStart || !validEnd) {
    const nextValue = value + insertion;
    return { value: nextValue, cursor: nextValue.length };
  }
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  return {
    value: value.slice(0, start) + insertion + value.slice(end),
    cursor: start + insertion.length,
  };
}
