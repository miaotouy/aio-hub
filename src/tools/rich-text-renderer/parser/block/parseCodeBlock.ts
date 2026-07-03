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

import { Token } from "../types";
import { AstNode } from "../../types";
import { computeFingerprint } from "../utils/text-utils";

/**
 * 解析代码块 - 分词器已经处理好了完整内容
 */
export function parseCodeBlock(
  tokens: Token[],
  start: number
): { node: AstNode | null; nextIndex: number } {
  const fence = tokens[start];
  if (fence.type !== "code_fence") {
    return { node: null, nextIndex: start + 1 };
  }

  const language = fence.language || "";

  // 如果语言标记为 mermaid，则生成 MermaidNode
  if (language === "mermaid") {
    return {
      node: {
        id: "",
        type: "mermaid",
        props: {
          content: fence.raw,
        },
        meta: { range: { start: 0, end: 0 }, status: "stable" },
        _fp: computeFingerprint(fence.raw),
      },
      nextIndex: start + 1,
    };
  }

  return {
    node: {
      id: "",
      type: "code_block",
      props: {
        language,
        content: fence.raw, // raw 现在包含完整的代码内容
        closed: fence.closed,
      },
      meta: { range: { start: 0, end: 0 }, status: "stable" },
      _fp: computeFingerprint(fence.raw),
    },
    nextIndex: start + 1,
  };
}
