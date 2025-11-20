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
