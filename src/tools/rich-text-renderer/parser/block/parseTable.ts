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

import type { Token, ParserContext } from "../types";
import type { AstNode } from "../../types";
import { isBlockStart } from "../utils/block-utils";
import { createTextNode } from "../utils/text-utils";
import {
  readTableLine,
  splitTableCells,
  tableDelimiterAlignments,
} from "../utils/table-utils";

/** Parse complete rows; column positions survive empty and ragged body cells. */
export function parseTable(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: AstNode | null; nextIndex: number } {
  let i = start;
  while (tokens[i]?.type === "newline") i++;
  const header = readTableLine(tokens, i);
  const separator = readTableLine(tokens, header.nextIndex);
  const aligns = tableDelimiterAlignments(separator.tokens);
  const headers = splitTableCells(header.tokens);
  if (!aligns || headers.length !== aligns.length)
    return { node: null, nextIndex: start + 1 };
  const meta = () => ({
    range: { start: 0, end: 0 },
    status: "stable" as const,
  });
  function cellChildren(cell: Token[]) {
    const children = ctx.parseInlines(cell);
    // Row splitting already trims layout whitespace. Remaining whitespace-only
    // text comes from literals (e.g. &#32;) and belongs to the cell's content.
    if (children.length || !cell.length || cell.some((t) => t.type !== "text"))
      return children;
    return [
      createTextNode(
        cell.map((t) => (t.type === "text" ? t.content : "")).join("")
      ),
    ];
  }
  function row(cells: Token[][], isHeader: boolean): AstNode {
    return {
      id: "",
      type: "table_row",
      props: isHeader ? { isHeader: true } : {},
      meta: meta(),
      children: aligns!.map((align, index) => ({
        id: "",
        type: "table_cell",
        props: { align, ...(isHeader ? { isHeader: true } : {}) },
        children: cellChildren(cells[index] ?? []),
        meta: meta(),
      })),
    };
  }
  const rows: AstNode[] = [row(headers, true)];
  i = separator.nextIndex;
  let previousNewline = tokens[separator.end];
  while (
    i < tokens.length &&
    !(previousNewline?.type === "newline" && previousNewline.count >= 2)
  ) {
    const first = tokens[i];
    if (first.type === "newline" || isBlockStart(first)) break;
    const line = readTableLine(tokens, i);
    rows.push(row(splitTableCells(line.tokens), false));
    previousNewline = tokens[line.end];
    i = line.nextIndex;
  }
  return {
    node: {
      id: "",
      type: "table",
      props: { align: aligns },
      children: rows,
      meta: meta(),
    },
    nextIndex: i,
  };
}
