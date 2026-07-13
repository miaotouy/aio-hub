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
import { VcpDailyNoteNode } from "../../types";
import { Tokenizer } from "../Tokenizer";

/**
 * 解析 VCP 日记容器
 */
export function parseVcpDailyNote(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: VcpDailyNoteNode | null; nextIndex: number } {
  const token = tokens[start];
  if (token.type !== "vcp_daily_note") {
    return { node: null, nextIndex: start };
  }

  const { content, closed } = token;

  // 对内容进行二次分词
  const tokenizer = new Tokenizer();
  const innerTokens = tokenizer.tokenize(content);

  // 递归解析内部块
  const children = ctx.parseBlocks(innerTokens);

  return {
    node: {
      id: "",
      type: "vcp_daily_note",
      props: {
        closed,
      },
      children,
      meta: {
        range: { start: 0, end: 0 },
        status: closed ? "stable" : "pending",
      },
    },
    nextIndex: start + 1,
  };
}
