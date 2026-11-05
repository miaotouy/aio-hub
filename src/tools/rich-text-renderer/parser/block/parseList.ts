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

import { Token, ParserContext } from "../types";
import { AstNode } from "../../types";
import { isBlockStart } from "../utils/block-utils";

export interface ListItemSnapshot {
  from: number;
  to: number;
  readTo: number;
  node: AstNode;
}

export interface ListItemCache {
  common: number;
  previous?: ListItemSnapshot[];
  current: ListItemSnapshot[];
}

/**
 * 解析列表
 */
export function parseList(
  ctx: ParserContext,
  tokens: Token[],
  start: number,
  cache?: ListItemCache
): { node: AstNode | null; nextIndex: number } {
  const firstMarker = tokens[start];
  if (firstMarker.type !== "list_marker") {
    return { node: null, nextIndex: start + 1 };
  }

  const ordered = firstMarker.ordered;
  const baseIndent = firstMarker.indent || 0;
  let i = start;
  const items: AstNode[] = [];

  while (i < tokens.length) {
    const marker = tokens[i];
    if (
      marker.type !== "list_marker" ||
      marker.indent !== baseIndent ||
      marker.ordered !== ordered
    )
      break;
    const previous = cache?.previous?.[items.length];
    if (
      cache &&
      previous &&
      previous.from === i &&
      previous.readTo <= cache.common
    ) {
      items.push(previous.node);
      cache.current.push(previous);
      i = previous.to;
      continue;
    }
    const from = i;
    let readTo = i + 1;
    const contentIndent = baseIndent + marker.raw.length;
    const itemTokens: Token[] = [];
    i++;
    let lineIndent = contentIndent;
    let startsLine = false;
    while (i < tokens.length) {
      readTo = Math.max(readTo, i + 1);
      const token = tokens[i];
      if (token.type === "list_marker" && token.indent <= baseIndent) break;
      if (token.type === "newline") {
        readTo = Math.max(readTo, i + 2);
        const next = tokens[i + 1];
        const nextIndent =
          token.nextIndent ??
          (next?.type === "list_marker"
            ? next.indent
            : next?.type === "text"
              ? /^ */.exec(next.content)![0].length
              : 0);
        if (token.count >= 2 && nextIndent < contentIndent) {
          i++;
          break;
        }
        itemTokens.push(token);
        lineIndent = nextIndent;
        startsLine = true;
        i++;
        continue;
      }
      if (
        isBlockStart(token) &&
        token.type !== "list_marker" &&
        lineIndent < contentIndent
      )
        break;
      if (startsLine && token.type === "text" && lineIndent >= contentIndent) {
        itemTokens.push({
          ...token,
          content: token.content.replace(
            new RegExp("^ {0," + contentIndent + "}"),
            ""
          ),
        });
      } else {
        itemTokens.push(token);
      }
      startsLine = false;
      i++;
    }
    const node: AstNode = {
      id: "",
      type: "list_item",
      props: {},
      children: ctx.parseBlocks(itemTokens),
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    };
    items.push(node);
    cache?.current.push({ from, to: i, readTo: Math.max(i + 1, readTo), node });
  }
  return {
    node: {
      id: "",
      type: "list",
      props: { ordered, ...(ordered ? { start: firstMarker.start ?? 1 } : {}) },
      children: items,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    },
    nextIndex: i,
  };
}
