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
