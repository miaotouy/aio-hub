import { Token, ParserContext } from "../types";
import { AstNode } from "../../types";
import { isBlockStart } from "../utils/block-utils";

/**
 * 解析引用块
 */
export function parseBlockquote(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: AstNode | null; nextIndex: number } {
  let i = start;
  const quoteLines: Token[][] = [];
  let currentLine: Token[] = [];

  let isLineStart = true;

  // 收集所有引用行
  while (i < tokens.length) {
    const t = tokens[i];

    // 换行
    if (t.type === "newline") {
      if (currentLine.length > 0) {
        quoteLines.push(currentLine);
        currentLine = [];
      }

      // 双换行结束引用
      if (t.count >= 2) {
        i++;
        break;
      }

      i++;
      isLineStart = true;
      continue;
    }

    if (isLineStart) {
      // 引用标记：这是引用行，消耗标记
      if (t.type === "blockquote_marker") {
        i++;
        isLineStart = false;
        continue;
      }

      // 非引用标记的行首：检查是否是其他块级标记
      // 如果是，说明引用结束（除非是懒惰延续，但这里简化处理，遇到新块即结束）
      if (isBlockStart(t)) {
        break;
      }

      // 如果是普通文本或其他内联元素，视为懒惰延续或引用内容的一部分
      // 标记不再是行首，继续收集
      isLineStart = false;
    }

    // 收集内容
    currentLine.push(t);
    i++;
  }

  // 保存最后一行
  if (currentLine.length > 0) {
    quoteLines.push(currentLine);
  }

  if (quoteLines.length === 0) {
    return { node: null, nextIndex: i };
  }

  // 将所有行合并，用单换行分隔
  const allTokens: Token[] = [];
  for (let j = 0; j < quoteLines.length; j++) {
    allTokens.push(...quoteLines[j]);
    if (j < quoteLines.length - 1) {
      allTokens.push({ type: "newline", count: 1 });
    }
  }

  const children = ctx.parseBlocks(allTokens);

  return {
    node: {
      id: "",
      type: "blockquote",
      props: {},
      children,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    },
    nextIndex: i,
  };
}
