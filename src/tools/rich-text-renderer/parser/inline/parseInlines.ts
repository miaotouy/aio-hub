import { Token, ParserContext } from "../types";
import { AstNode, GenericHtmlNode } from "../../types";
import { createTextNode } from "../utils/text-utils";

/**
 * 内联解析
 */
export function parseInlines(ctx: ParserContext, tokens: Token[]): AstNode[] {
  const nodes: AstNode[] = [];
  let i = 0;
  let accumulatedText = "";

  const flushText = () => {
    if (accumulatedText) {
      // 去除纯空白文本
      if (accumulatedText.trim().length > 0) {
        nodes.push(createTextNode(accumulatedText));
      }
      accumulatedText = "";
    }
  };

  while (i < tokens.length) {
    const token = tokens[i];

    // HTML 内联标签
    if (token.type === "html_open") {
      flushText();

      const tagName = token.tagName;
      const htmlNode: GenericHtmlNode = {
        id: "",
        type: "generic_html",
        props: { tagName, attributes: token.attributes },
        children: [],
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      };

      i++;

      if (token.selfClosing) {
        nodes.push(htmlNode);
        continue;
      }

      // 收集内部令牌
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
          // 过滤纯空白文本
          if (t.type === "text" && /^\s+$/.test(t.content)) {
            i++;
            continue;
          }
          innerTokens.push(t);
        }
        i++;
      }

      htmlNode.children = ctx.parseInlines(innerTokens);
      nodes.push(htmlNode);
      continue;
    }

    // 加粗
    if (token.type === "strong_delimiter") {
      flushText();

      // 预先检查是否有闭合标记
      let hasClosing = false;
      let tempI = i + 1;
      while (tempI < tokens.length) {
        const t = tokens[tempI];
        if (t.type === "strong_delimiter" && t.marker === token.marker) {
          hasClosing = true;
          break;
        }
        tempI++;
      }

      if (hasClosing) {
        i++;
        const innerTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === "strong_delimiter" && t.marker === token.marker) {
            i++;
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: "",
          type: "strong",
          props: {},
          children: ctx.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        continue;
      } else {
        // 没有闭合标记，当作普通文本处理
        accumulatedText += token.marker;
        i++;
        continue;
      }
    }

    // 斜体
    if (token.type === "em_delimiter") {
      flushText();

      // 预先检查是否有闭合标记
      let hasClosing = false;
      let tempI = i + 1;
      while (tempI < tokens.length) {
        const t = tokens[tempI];
        if (t.type === "em_delimiter" && t.marker === token.marker) {
          hasClosing = true;
          break;
        }
        tempI++;
      }

      if (hasClosing) {
        i++;
        const innerTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === "em_delimiter" && t.marker === token.marker) {
            i++;
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: "",
          type: "em",
          props: {},
          children: ctx.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        continue;
      } else {
        // 没有闭合标记，当作普通文本处理
        accumulatedText += token.marker;
        i++;
        continue;
      }
    }

    // 行内代码 - 直接使用分词器处理好的内容
    if (token.type === "inline_code") {
      flushText();
      nodes.push({
        id: "",
        type: "inline_code",
        props: { content: token.content },
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      i++;
      continue;
    }

    // KaTeX 行内公式 - 直接使用分词器处理好的内容
    if (token.type === "katex_inline") {
      flushText();
      nodes.push({
        id: "",
        type: "katex_inline",
        props: { content: token.content },
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      i++;
      continue;
    }

    // 删除线
    if (token.type === "strikethrough_delimiter") {
      flushText();

      // 预先检查是否有闭合标记
      let hasClosing = false;
      let tempI = i + 1;
      while (tempI < tokens.length) {
        const t = tokens[tempI];
        if (t.type === "strikethrough_delimiter") {
          hasClosing = true;
          break;
        }
        tempI++;
      }

      if (hasClosing) {
        i++;
        const innerTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === "strikethrough_delimiter") {
            i++;
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: "",
          type: "strikethrough",
          props: {},
          children: ctx.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        continue;
      } else {
        // 没有闭合标记，当作普通文本处理
        accumulatedText += token.marker;
        i++;
        continue;
      }
    }

    // 引号 (支持 “...” 和 ”...“ 以及 “...“ 和 "..." 等各种组合)
    if (token.type === "quote_delimiter") {
      flushText();

      // 记录起始引号，用于如果匹配失败时还原文本
      const startMarker = token.marker;

      // 查找下一个引号作为闭合标记
      let foundClosing = false;
      let tempI = i + 1;
      while (tempI < tokens.length) {
        const t = tokens[tempI];
        // 只要遇到任何一个引号标记，都视为闭合
        // 这样可以支持 “内容“ (两左) 或 ”内容“ (反向) 等非标准情况
        if (t.type === "quote_delimiter") {
          foundClosing = true;
          break;
        }
        tempI++;
      }

      if (foundClosing) {
        i++; // 跳过起始引号
        const innerTokens: Token[] = [];
        let endMarker = "";

        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === "quote_delimiter") {
            endMarker = t.marker;
            i++; // 跳过闭合引号
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: "",
          type: "quote",
          props: {
            startMarker,
            endMarker,
          },
          children: ctx.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        continue;
      } else {
        // 没找到闭合引号，当作普通文本处理
        accumulatedText += startMarker;
        i++;
        continue;
      }
    }

    // Autolink: <url>
    if (token.type === "autolink") {
      flushText();
      nodes.push({
        id: "",
        type: "link",
        props: { href: token.url, title: "" },
        children: [createTextNode(token.url)],
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      i++;
      continue;
    }

    // 图片 ![alt](url)
    if (token.type === "image_marker") {
      flushText();
      i++;

      // 检查后面是否跟着 [
      if (i < tokens.length && tokens[i].type === "link_text_open") {
        i++; // 跳过 [

        // 收集 alt 文本
        let alt = "";
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === "link_text_close") {
            i++;
            break;
          }
          if (t.type === "text") {
            alt += t.content;
          }
          i++;
        }

        // 收集 URL
        let src = "";
        let title = "";
        if (i < tokens.length && tokens[i].type === "link_url_open") {
          i++;

          while (i < tokens.length) {
            const t = tokens[i];
            if (t.type === "link_url_close") {
              i++;
              break;
            }
            if (t.type === "text") {
              // 支持 title：(url "title")
              const parts = t.content.match(/^([^\s]+)(?:\s+"([^"]+)")?$/);
              if (parts) {
                src += parts[1];
                if (parts[2]) {
                  title = parts[2];
                }
              } else {
                src += t.content;
              }
            }
            i++;
          }
        }

        nodes.push({
          id: "",
          type: "image",
          props: { src, alt, title },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        continue;
      } else {
        // 不是图片语法，按普通文本处理
        accumulatedText += "!";
        continue;
      }
    }

    // 链接 [text](url)
    if (token.type === "link_text_open") {
      flushText();
      i++;

      // 收集链接文本，支持嵌套的括号（如图片）
      const linkTextTokens: Token[] = [];
      let bracketDepth = 1; // 已经遇到了一个 [

      while (i < tokens.length && bracketDepth > 0) {
        const t = tokens[i];

        if (t.type === "link_text_open") {
          bracketDepth++;
          linkTextTokens.push(t);
        } else if (t.type === "link_text_close") {
          bracketDepth--;
          if (bracketDepth === 0) {
            i++; // 跳过最外层的 ]
            break;
          }
          linkTextTokens.push(t);
        } else {
          linkTextTokens.push(t);
        }
        i++;
      }

      // 收集 URL
      let href = "";
      let title = "";
      if (i < tokens.length && tokens[i].type === "link_url_open") {
        i++;

        let parenDepth = 1; // 已经遇到了一个 (

        while (i < tokens.length && parenDepth > 0) {
          const t = tokens[i];

          if (t.type === "link_url_open") {
            parenDepth++;
            if (parenDepth > 1) {
              href += "(";
            }
          } else if (t.type === "link_url_close") {
            parenDepth--;
            if (parenDepth === 0) {
              i++; // 跳过最外层的 )
              break;
            }
            href += ")";
          } else if (t.type === "text") {
            // 支持 title：(url "title")
            const parts = t.content.match(/^([^\s]+)(?:\s+"([^"]+)")?$/);
            if (parts) {
              href += parts[1];
              if (parts[2]) {
                title = parts[2];
              }
            } else {
              href += t.content;
            }
          }
          i++;
        }
      }

      nodes.push({
        id: "",
        type: "link",
        props: { href, title },
        children: ctx.parseInlines(linkTextTokens),
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      continue;
    }

    // 文本
    if (token.type === "text") {
      accumulatedText += token.content;
      i++;
      continue;
    }

    // 单换行转为硬换行
    if (token.type === "newline" && token.count === 1) {
      flushText();
      nodes.push({
        id: "",
        type: "hard_break",
        props: {},
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      i++;
      continue;
    }

    // 其他令牌跳过
    i++;
  }

  flushText();
  return nodes;
}
