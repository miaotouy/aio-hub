import { Token, ParserContext } from "../types";
import { ActionButtonNode, AstNode, GenericHtmlNode } from "../../types";

/**
 * 从 AST 节点数组中提取纯文本内容
 */
function extractTextFromNodes(nodes: AstNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.props.content;
      }
      if (node.children) {
        return extractTextFromNodes(node.children);
      }
      return "";
    })
    .join("");
}

/**
 * 解析内联HTML标签(在HTML块内部使用)
 */
export function parseInlineHtmlTag(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: GenericHtmlNode | ActionButtonNode | null; nextIndex: number } {
  const openToken = tokens[start];
  if (openToken.type !== "html_open") {
    return { node: null, nextIndex: start + 1 };
  }

  const tagName = openToken.tagName.toLowerCase();

  // --- 特殊处理：<button> 标签可能是 ActionButton ---
  if (tagName === "button") {
    const action = openToken.attributes.type as "send" | "input" | "copy" | undefined;

    // 安全性检查：只处理白名单内的 action 类型
    if (action && ["send", "input", "copy"].includes(action)) {
      let label = "";
      let content = openToken.attributes.value || "";
      const style = openToken.attributes.style;
      let i = start + 1;

      if (openToken.selfClosing) {
        // 自闭合标签: label 和 content 都来自 value
        label = openToken.attributes.value || "";
        if (!content) {
          content = label;
        }
      } else {
        // 非自闭合标签: 收集内部 tokens
        const innerTokens: Token[] = [];
        let depth = 1;

        while (i < tokens.length && depth > 0) {
          const t = tokens[i];

          if (t.type === "html_open" && t.tagName.toLowerCase() === "button" && !t.selfClosing) {
            depth++;
            innerTokens.push(t);
          } else if (t.type === "html_close" && t.tagName.toLowerCase() === "button") {
            depth--;
            if (depth === 0) {
              i++; // 跳过闭合标签
              break;
            }
            innerTokens.push(t);
          } else {
            innerTokens.push(t);
          }
          i++;
        }

        const childNodes = ctx.parseInlines(innerTokens);
        label = extractTextFromNodes(childNodes);
        if (!content) {
          content = label;
        }
      }

      const buttonNode: ActionButtonNode = {
        id: "",
        type: "action_button",
        props: { action, label, content, style },
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      };

      return { node: buttonNode, nextIndex: i };
    }
  }
  // --- 结束特殊处理 ---

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
