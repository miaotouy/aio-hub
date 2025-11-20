import { Token, ParserContext } from "../types";
import { AstNode } from "../../types";
import { isBlockStart } from "../utils/block-utils";

/**
 * 解析列表
 */
export function parseList(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: AstNode | null; nextIndex: number } {
  const firstMarker = tokens[start];
  if (firstMarker.type !== "list_marker") {
    return { node: null, nextIndex: start + 1 };
  }

  const ordered = firstMarker.ordered;
  let i = start;
  const items: AstNode[] = [];

  while (i < tokens.length) {
    const t = tokens[i];

    // 检查是否是同类型的列表标记
    if (t.type !== "list_marker") {
      break;
    }

    // 不同类型的列表标记，结束当前列表
    if (t.ordered !== ordered) {
      break;
    }

    // 解析列表项
    i++; // 跳过列表标记
    const itemTokens: Token[] = [];

    while (i < tokens.length) {
      const tok = tokens[i];

      // 遇到新的列表项结束当前项
      if (tok.type === "list_marker") {
        break;
      }

      // 遇到其他块级标记结束当前项
      if (isBlockStart(tok)) {
        break;
      }

      // 遇到双换行结束当前项
      if (tok.type === "newline" && tok.count >= 2) {
        i++; // 跳过双换行
        break;
      }

      // 单换行：继续收集
      if (tok.type === "newline") {
        itemTokens.push(tok);
        i++;
        continue;
      }

      itemTokens.push(tok);
      i++;
    }

    if (itemTokens.length > 0) {
      // 列表项内容作为块级元素解析
      const itemChildren = ctx.parseBlocks(itemTokens);

      // 如果解析出了内容
      if (itemChildren.length > 0) {
        items.push({
          id: "",
          type: "list_item",
          props: {},
          children: itemChildren,
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
      }
    }
  }

  if (items.length === 0) {
    return { node: null, nextIndex: i };
  }

  return {
    node: {
      id: "",
      type: "list",
      props: { ordered },
      children: items,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    },
    nextIndex: i,
  };
}
