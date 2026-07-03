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
import { HeadingNode } from "../../types";

/**
 * 解析标题
 */
export function parseHeading(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: HeadingNode | null; nextIndex: number } {
  const marker = tokens[start];
  if (marker.type !== "heading_marker") {
    return { node: null, nextIndex: start + 1 };
  }

  const level = marker.level;
  let i = start + 1;

  // 收集到换行为止
  const contentTokens: Token[] = [];
  while (i < tokens.length && tokens[i].type !== "newline") {
    contentTokens.push(tokens[i]);
    i++;
  }

  // 跳过换行
  if (i < tokens.length && tokens[i].type === "newline") {
    i++;
  }

  const children = ctx.parseInlines(contentTokens);

  return {
    node: {
      id: "",
      type: "heading",
      props: { level },
      children,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    },
    nextIndex: i,
  };
}
