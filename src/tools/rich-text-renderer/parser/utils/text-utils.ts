import { Token } from "../types";
import { AstNode } from "../../types";

/**
 * 将令牌序列转换回原始文本
 */
export function tokensToRawText(tokens: Token[]): string {
  let text = "";
  for (const token of tokens) {
    switch (token.type) {
      case "text":
        text += token.content;
        break;
      case "newline":
        text += "\n".repeat(token.count);
        break;
      case "html_open":
      case "html_close":
      case "strong_delimiter":
      case "em_delimiter":
      case "strikethrough_delimiter":
      case "quote_delimiter":
      case "image_marker":
      case "link_text_open":
      case "link_text_close":
      case "link_url_open":
      case "link_url_close":
      case "heading_marker":
      case "blockquote_marker":
      case "list_marker":
      case "hr_marker":
        text += token.raw;
        break;
      case "inline_code":
        text += `\`${token.content}\``;
        break;
      case "code_fence":
        text += token.raw;
        break;
      case "katex_inline":
        text += `$${token.content}$`;
        break;
      case "katex_block":
        text += `$$${token.content}$$`;
        break;
    }
  }
  return text;
}

/**
 * 优化连续链接（徽章和导航链接）之间的换行
 * 检测以 [ 开头的链接（包括图片链接和普通链接），移除它们之间的硬换行
 */
export function optimizeBadgeLineBreaks(nodes: AstNode[]): AstNode[] {
  return nodes.map((node) => {
    // 只处理段落节点
    if (node.type !== "paragraph" || !node.children) {
      // 递归处理子节点
      if (node.children) {
        return {
          ...node,
          children: optimizeBadgeLineBreaks(node.children),
        };
      }
      return node;
    }

    // 处理段落内的子节点
    const children = node.children;
    const optimizedChildren: AstNode[] = [];

    for (let i = 0; i < children.length; i++) {
      const current = children[i];
      const next = children[i + 1];
      const afterNext = children[i + 2];
      const afterAfterNext = children[i + 3];

      // 检测是否是链接或图片节点
      const isLinkLike = (n: AstNode | undefined): boolean => {
        if (!n) return false;
        return n.type === "link" || n.type === "image";
      };

      // 模式1：链接 + 硬换行 + 链接
      if (isLinkLike(current) && next?.type === "hard_break" && isLinkLike(afterNext)) {
        // 保留当前节点，跳过硬换行
        optimizedChildren.push(current);
        i++; // 跳过 hard_break
        continue;
      }

      // 模式2：链接 + 短文本分隔符 + 硬换行 + 链接
      if (
        isLinkLike(current) &&
        next?.type === "text" &&
        typeof next.props?.content === "string" &&
        next.props.content.trim().length <= 3 && // 短分隔符，如 " •"
        afterNext?.type === "hard_break" &&
        isLinkLike(afterAfterNext)
      ) {
        // 保留当前链接和分隔符，跳过硬换行
        optimizedChildren.push(current);
        optimizedChildren.push(next); // 分隔符文本
        i += 2; // 跳过分隔符和硬换行
        continue;
      }

      optimizedChildren.push(current);
    }

    return {
      ...node,
      children: optimizedChildren,
    };
  });
}

export function createTextNode(content: string): AstNode {
  return {
    id: "",
    type: "text",
    props: { content },
    meta: { range: { start: 0, end: 0 }, status: "stable" },
  };
}
