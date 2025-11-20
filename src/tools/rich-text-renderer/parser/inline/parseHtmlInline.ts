import { Token, ParserContext } from "../types";
import { GenericHtmlNode } from "../../types";

/**
 * 解析内联HTML标签(在HTML块内部使用)
 */
export function parseInlineHtmlTag(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: GenericHtmlNode | null; nextIndex: number } {
  const openToken = tokens[start];
  if (openToken.type !== "html_open") {
    return { node: null, nextIndex: start + 1 };
  }

  const tagName = openToken.tagName;
  const htmlNode: GenericHtmlNode = {
    id: "",
    type: "generic_html",
    props: { tagName, attributes: openToken.attributes },
    children: [],
    meta: { range: { start: 0, end: 0 }, status: "stable" },
  };

  if (openToken.selfClosing) {
    return { node: htmlNode, nextIndex: start + 1 };
  }

  let i = start + 1;
  const innerTokens: Token[] = [];
  let depth = 1;

  while (i < tokens.length && depth > 0) {
    const t = tokens[i];

    if (t.type === "html_open" && t.tagName === tagName && !t.selfClosing) {
      depth++;
      innerTokens.push(t);
    } else if (t.type === "html_close" && t.tagName === tagName) {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
      innerTokens.push(t);
    } else {
      innerTokens.push(t);
    }
    i++;
  }

  // 递归解析内部内容(使用parseInlines保持内联特性)
  if (innerTokens.length > 0) {
    htmlNode.children = ctx.parseInlines(innerTokens);
  }

  return { node: htmlNode, nextIndex: i };
}
