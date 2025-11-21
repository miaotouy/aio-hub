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
  const baseIndent = firstMarker.indent || 0;
  let i = start;
  const items: AstNode[] = [];

  while (i < tokens.length) {
    const t = tokens[i];

    // 检查是否是列表标记
    if (t.type !== "list_marker") {
      break;
    }

    // 检查缩进：如果缩进小于基准缩进，说明列表结束（回到了上一级）
    if ((t.indent || 0) < baseIndent) {
      break;
    }


    // 检查列表类型是否一致 (ordered vs unordered)
    // 注意：不同层级的列表类型可以不同，但同级应该一致（通常）
    // 但 Markdown 允许混合。不过为了简单，我们通常按类型分组。
    // 如果类型不同且缩进相同，通常视为两个列表。
    if (t.ordered !== ordered && (t.indent || 0) === baseIndent) {
      break;
    }

    // 解析列表项
    i++; // 跳过列表标记
    const itemTokens: Token[] = [];

    while (i < tokens.length) {
      const tok = tokens[i];

      // 遇到列表标记
      if (tok.type === "list_marker") {
        const nextIndent = tok.indent || 0;

        // 如果是同级或更高级（缩进更小）的列表标记，结束当前项
        if (nextIndent <= baseIndent) {
          break;
        }

        // 如果是子列表（缩进更大），它是当前项的一部分，继续收集
        // 这样 parseBlocks 就会包含这个 list_marker，并递归调用 parseList
      }

      if (tok.type !== "list_marker" && isBlockStart(tok)) {
        // 如果是其他块级元素，暂时保持原样（打断列表）
        // 除非我们需要支持列表内嵌套其他块
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
