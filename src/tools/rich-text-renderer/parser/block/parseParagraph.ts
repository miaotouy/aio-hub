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
import { ParagraphNode } from "../../types";
import { isBlockStart } from "../utils/block-utils";

/**
 * 解析段落
 */
export function parseParagraph(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: ParagraphNode | null; nextIndex: number } {
  const contentTokens: Token[] = [];
  let i = start;

  while (i < tokens.length) {
    const t = tokens[i];

    // 块级分隔符：双换行
    if (t.type === "newline") {
      if (t.count >= 2) {
        break;
      }
      // 单换行继续收集
      contentTokens.push(t);
      i++;
      continue;
    }

    // 块级标记：遇到这些标记停止段落
    if (isBlockStart(t)) {
      break;
    }

    // 检查是否是 LLM 思考块的开始 (即使没有空行也能中断段落)
    if (
      t.type === "html_open" &&
      ctx.getOptions().llmThinkTagNames.has(t.tagName)
    ) {
      break;
    }

    contentTokens.push(t);
    i++;
  }

  if (contentTokens.length === 0) {
    return { node: null, nextIndex: i };
  }

  const children = ctx.parseInlines(contentTokens);

  if (children.length === 0) {
    return { node: null, nextIndex: i };
  }

  return {
    node: {
      id: "",
      type: "paragraph",
      props: {},
      children,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    },
    nextIndex: i,
  };
}
