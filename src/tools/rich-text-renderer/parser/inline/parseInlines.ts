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

    // 自动链接: <url>
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
      const startI = i;
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
        let hasUrl = false;

        if (i < tokens.length && tokens[i].type === "link_url_open") {
          hasUrl = true;
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

        if (hasUrl) {
          nodes.push({
            id: "",
            type: "image",
            props: { src, alt, title },
            meta: { range: { start: 0, end: 0 }, status: "stable" },
          });
          continue;
        } else {
          // 缺少 URL 部分，回退为普通文本
          i = startI + 1; // 回到 ! 之后
          accumulatedText += "!";
          continue;
        }
      } else {
        // 不是图片语法，按普通文本处理
        accumulatedText += "!";
        continue;
      }
    }

    // 链接 [text](url)
    if (token.type === "link_text_open") {
      const startI = i;
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
      let hasUrl = false;

      if (i < tokens.length && tokens[i].type === "link_url_open") {
        hasUrl = true;
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

      if (hasUrl) {
        nodes.push({
          id: "",
          type: "link",
          props: { href, title },
          children: ctx.parseInlines(linkTextTokens),
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        continue;
      } else {
        // 缺少 URL 部分，回退为普通文本
        i = startI + 1; // 回到 [ 之后
        accumulatedText += "[";
        continue;
      }
    }

    // 文本 (包含自动链接检测)
    if (token.type === "text") {
      const content = token.content;
      
      // 正则匹配 URL 和 邮箱
      // 1. http/https 开头的链接
      // 2. www. 开头的链接
      // 3. 邮箱地址
      // 注意：排除末尾的标点符号
      const urlRegex = /((?:https?:\/\/|www\.)[^\s<]+)|([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})/g;
      
      let match;
      let lastIndex = 0;
      let hasMatch = false;

      // 必须重置 lastIndex，因为 regex 是带 g 标志的
      urlRegex.lastIndex = 0;

      while ((match = urlRegex.exec(content)) !== null) {
        hasMatch = true;
        
        // 在处理匹配之前，先处理之前的文本
        // 1. 如果有 accumulatedText，先 flush
        flushText();
        
        // 2. 处理当前 content 中匹配项之前的文本
        const preText = content.slice(lastIndex, match.index);
        if (preText) {
          nodes.push(createTextNode(preText));
        }

        // 3. 处理匹配到的 URL/邮箱
        let url = match[0];
        let text = url;
        
        // 处理末尾标点符号 (常见痛点: URL 后面的句号或逗号不应包含在 URL 中)
        const trailingPunctuation = /[.,;!?)]+$/;
        const punctuationMatch = url.match(trailingPunctuation);
        if (punctuationMatch) {
          const punctuation = punctuationMatch[0];
          url = url.slice(0, -punctuation.length);
          text = url;
          // 调整 regex 的 lastIndex，以便下一次循环能正确处理标点
          // 注意：exec 循环会自动更新 lastIndex 到匹配项末尾，我们需要回退
          urlRegex.lastIndex -= punctuation.length;
        }

        // 如果是 www. 开头，补全 https://
        if (url.startsWith("www.")) {
          url = "https://" + url;
        }
        // 如果是邮箱，补全 mailto:
        else if (match[2]) { // match[2] 是邮箱捕获组
          url = "mailto:" + url;
        }

        nodes.push({
          id: "",
          type: "link",
          props: { href: url, title: "" },
          children: [createTextNode(text)],
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });

        // 如果有分离出的标点，它会在下一次循环或者循环结束后作为普通文本处理
        // 因为我们调整了 lastIndex（如果需要的话），或者它本身就在 match[0] 之后
        // 修正逻辑：上面的 lastIndex 回退逻辑对于 exec 循环可能比较复杂
        // 更简单的做法：手动处理标点
        
        if (punctuationMatch) {
            // 这种情况下，标点符号实际上还在 content 中等待处理
            // 我们不需要回退 lastIndex，因为我们已经手动截断了 url
            // 但是我们需要把标点符号留给下一轮或者作为文本添加
            // 实际上，exec 的 lastIndex 已经指向了完整 match[0] 的末尾
            // 我们只需要把标点符号作为普通文本添加即可
            nodes.push(createTextNode(punctuationMatch[0]));
        }

        lastIndex = match.index + match[0].length;
      }

      if (hasMatch) {
        // 处理剩余文本
        const remainingText = content.slice(lastIndex);
        if (remainingText) {
          accumulatedText = remainingText; // 留给下一次迭代或 flush
        }
      } else {
        // 没有匹配到 URL，照常处理
        accumulatedText += content;
      }

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

    // 处理未被消费的特殊字符 (如孤立的括号)
    if (
      token.type === "link_url_open" ||
      token.type === "link_url_close" ||
      token.type === "link_text_close"
    ) {
      accumulatedText +=
        token.raw ||
        (token.type === "link_url_open"
          ? "("
          : token.type === "link_url_close"
            ? ")"
            : "]");
      i++;
      continue;
    }

    // 其他令牌跳过
    i++;
  }

  flushText();
  return nodes;
}
