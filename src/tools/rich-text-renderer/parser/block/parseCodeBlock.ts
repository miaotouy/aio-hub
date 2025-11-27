import { Token } from "../types";
import { AstNode } from "../../types";

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
    },
    nextIndex: start + 1,
  };
}
