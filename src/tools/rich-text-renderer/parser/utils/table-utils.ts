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

import type { Token } from "../types";

/** Split delimiter pipes while retaining empty cells and already-decoded literals. */
export function splitTableCells(tokens: Token[]): Token[][] {
  const cells: Token[][] = [[]];
  let hasDelimiter = false;
  for (const token of tokens) {
    if (
      token.type !== "text" ||
      token.raw !== undefined ||
      !token.content.includes("|")
    ) {
      cells[cells.length - 1].push(token);
      continue;
    }
    const parts = token.content.split("|");
    for (let i = 0; i < parts.length; i++) {
      if (i) {
        cells.push([]);
        hasDelimiter = true;
      }
      if (parts[i])
        cells[cells.length - 1].push({ ...token, content: parts[i] });
    }
  }
  const isBlank = (cell: Token[]) =>
    cell.every(
      (t) =>
        t.type === "text" && t.raw === undefined && /^[ \t]*$/.test(t.content)
    );
  if (hasDelimiter && isBlank(cells[0])) cells.shift();
  if (hasDelimiter && isBlank(cells[cells.length - 1])) cells.pop();
  return cells.map((cell) => {
    const trimmed = [...cell];
    while (trimmed[0]?.type === "text" && trimmed[0].raw === undefined) {
      const first = trimmed[0];
      const content = first.content.replace(/^[ \t]+/, "");
      if (content) {
        trimmed[0] = { ...first, content };
        break;
      }
      trimmed.shift();
    }
    while (
      trimmed[trimmed.length - 1]?.type === "text" &&
      (trimmed[trimmed.length - 1] as Extract<Token, { type: "text" }>).raw ===
        undefined
    ) {
      const last = trimmed[trimmed.length - 1] as Extract<
        Token,
        { type: "text" }
      >;
      const content = last.content.replace(/[ \t]+$/, "");
      if (content) {
        trimmed[trimmed.length - 1] = { ...last, content };
        break;
      }
      trimmed.pop();
    }
    return trimmed;
  });
}

export function readTableLine(tokens: Token[], start: number) {
  let end = start;
  while (end < tokens.length && tokens[end].type !== "newline") end++;
  return {
    tokens: tokens.slice(start, end),
    end,
    nextIndex: end < tokens.length ? end + 1 : end,
  };
}

export function tableDelimiterAlignments(
  tokens: Token[]
): ("left" | "center" | "right")[] | undefined {
  if (tokens.some((t) => t.type !== "text" || t.raw !== undefined)) return;
  const cells = splitTableCells(tokens).map((cell) =>
    cell.map((t) => (t.type === "text" ? t.content : "")).join("")
  );
  if (!cells.length || cells.some((cell) => !/^:?-+:?$/.test(cell))) return;
  return cells.map((cell) =>
    cell.startsWith(":") && cell.endsWith(":")
      ? "center"
      : cell.endsWith(":")
        ? "right"
        : "left"
  );
}
