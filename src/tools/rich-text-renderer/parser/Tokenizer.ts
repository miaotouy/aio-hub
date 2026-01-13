import { Token } from "./types";

// ============ 分词器 (性能优化版) ============

/**
 * 辅助函数：使用 sticky 正则匹配
 * Sticky 模式允许正则直接从指定位置开始匹配，避免了创建字符串切片的开销。
 */
function stickyMatch(
  regex: RegExp,
  text: string,
  pos: number
): RegExpExecArray | null {
  regex.lastIndex = pos;
  return regex.exec(text);
}

// 预编译正则表达式（带 sticky 标志，提升匹配性能）
const RE_HTML_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)\s*([\s\S]*?)\s*(\/?)\>/y;
const RE_MATHJAX_INLINE = /\\\((.*?)\\\)/y;
const RE_ESCAPE_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const RE_AUTOLINK = /<((?:https?|ftps?|mailto):[^\s>]+)>/y;
const RE_HTML_COMMENT = /<!--[\s\S]*?-->/y;
const RE_INDENT = /( *)/y;
const RE_CODE_FENCE_OPEN = /```(\w*)/y;
const RE_HEADING = /(#{1,6})\s/y;
const RE_HR = /(---+|\*\*\*+|___+)(\s*)(?=\n|$)/y;
const RE_LIST = /([*+-]|\d+\.)\s/y;
const RE_BLOCKQUOTE = />[ \t]?/y;
const RE_KATEX_INLINE = /\$([^\n$]+?)\$/y;
const RE_ATTR = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const RE_SPECIAL_CHARS = /[<`*_~^!\[\]()#>\n$“"”\\]/g;
const RE_VCP_ARG = /([a-zA-Z0-9_-]+):「始」([\s\S]*?)「末」/g;
const RE_VCP_PENDING = /([a-zA-Z0-9_-]+):「始」([\s\S]*)$/;
const RE_VCP_RESULT_FIELD = /-\s*(工具名称|执行状态|返回内容):\s*([\s\S]*?)(?=\n-|\nVCP调用结果结束\]\]|$)/g;

export class Tokenizer {
  // HTML void elements (不需要闭合标签的元素)
  private static readonly voidElements = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  private static readonly rawElements = new Set([
    "code",
    "pre",
    "script",
    "style",
  ]);

  /**
   * 将完整文本转换为令牌序列
   */
  public tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const len = text.length;
    let i = 0;
    let atLineStart = true;
    let rawTagStack: string[] = [];

    while (i < len) {
      const char = text.charCodeAt(i);

      // --- 原始文本模式 (Raw Mode) 处理 ---
      if (rawTagStack.length > 0) {
        // 原始模式仅处理换行符、匹配的闭合标签及普通文本
        if (char === 10) {
          tokens.push({ type: "newline", count: 1 });
          i++;
          atLineStart = true;
          continue;
        }

        if (char === 60) { // '<'
          const htmlMatch = stickyMatch(RE_HTML_TAG, text, i);
          if (htmlMatch) {
            const isClosing = !!htmlMatch[1];
            const tagName = htmlMatch[2].toLowerCase();
            const targetTagName = rawTagStack[rawTagStack.length - 1];

            // 仅当匹配栈顶标签名时退出原始模式
            if (isClosing && tagName === targetTagName) {
              rawTagStack.pop();
              tokens.push({ type: "html_close", tagName, raw: htmlMatch[0] });
              i += htmlMatch[0].length;
              atLineStart = false;
              continue;
            }
          }
        }

        // 贪婪匹配普通文本，直至遇到 '<' 或 '\n'
        RE_SPECIAL_CHARS.lastIndex = i;
        let match = RE_SPECIAL_CHARS.exec(text);
        let textEnd = len;
        if (match) {
          let searchIdx = match.index;
          while (searchIdx < len) {
            const c = text.charCodeAt(searchIdx);
            if (c === 60 || c === 10) {
              textEnd = searchIdx;
              break;
            }
            RE_SPECIAL_CHARS.lastIndex = searchIdx + 1;
            match = RE_SPECIAL_CHARS.exec(text);
            if (!match) {
              textEnd = len;
              break;
            }
            searchIdx = match.index;
          }
        }

        if (textEnd > i) {
          tokens.push({ type: "text", content: text.slice(i, textEnd) });
          i = textEnd;
        } else {
          tokens.push({ type: "text", content: text[i] });
          i++;
        }
        atLineStart = false;
        continue;
      }

      // --- 正常解析模式 ---

      // 1. 换行符
      if (char === 10) {
        let count = 1;
        while (i + count < len && text.charCodeAt(i + count) === 10) {
          count++;
        }
        tokens.push({ type: "newline", count });
        i += count;
        atLineStart = true;
        continue;
      }

      // 2. MathJax 块级公式 \[...\] (优先级高于转义)
      if (char === 92 && i + 1 < len && text.charCodeAt(i + 1) === 91) {
        const startIdx = i + 2;
        let endIdx = startIdx;
        while (endIdx < len) {
          if (text.charCodeAt(endIdx) === 92 && endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 93) break;
          endIdx++;
        }

        const formulaContent = text.slice(startIdx, endIdx).trim();
        i = endIdx < len ? endIdx + 2 : endIdx;
        tokens.push({ type: "katex_block", content: formulaContent });
        atLineStart = false;
        continue;
      }

      // 3. MathJax 行内公式 \(...\)
      if (char === 92 && i + 1 < len && text.charCodeAt(i + 1) === 40) {
        const mathjaxMatch = stickyMatch(RE_MATHJAX_INLINE, text, i);
        if (mathjaxMatch) {
          const formulaContent = mathjaxMatch[1];
          if (!formulaContent.includes("\n") && !formulaContent.includes("\\(") && !formulaContent.includes("\\[")) {
            tokens.push({ type: "katex_inline", content: formulaContent });
            i += mathjaxMatch[0].length;
            atLineStart = false;
            continue;
          }
        }
      }

      // 4. 转义字符
      if (char === 92) {
        if (i + 1 < len && RE_ESCAPE_PUNCT.test(text[i + 1])) {
          tokens.push({ type: "text", content: text[i + 1] });
          i += 2;
        } else {
          tokens.push({ type: "text", content: "\\" });
          i += 1;
        }
        atLineStart = false;
        continue;
      }

      // 5. Autolink, Comment, HTML Tag
      if (char === 60) {
        const autolinkMatch = stickyMatch(RE_AUTOLINK, text, i);
        if (autolinkMatch) {
          tokens.push({ type: "autolink", url: autolinkMatch[1], raw: autolinkMatch[0] });
          i += autolinkMatch[0].length;
          atLineStart = false;
          continue;
        }

        const commentMatch = stickyMatch(RE_HTML_COMMENT, text, i);
        if (commentMatch) {
          tokens.push({ type: "html_comment", content: commentMatch[0].slice(4, -3), raw: commentMatch[0] });
          i += commentMatch[0].length;
          atLineStart = false;
          continue;
        }

        const htmlMatch = stickyMatch(RE_HTML_TAG, text, i);
        if (htmlMatch) {
          const rawTag = htmlMatch[0];
          const isClosing = !!htmlMatch[1];
          const tagName = htmlMatch[2].toLowerCase();
          const attributes = this.parseAttributes(htmlMatch[3]);
          const isSelfClosing = !!htmlMatch[4] || Tokenizer.voidElements.has(tagName);

          if (isClosing) {
            tokens.push({ type: "html_close", tagName, raw: rawTag });
          } else {
            if (!isSelfClosing && Tokenizer.rawElements.has(tagName)) {
              rawTagStack.push(tagName);
            }
            tokens.push({ type: "html_open", tagName, attributes, selfClosing: isSelfClosing, raw: rawTag });
          }
          i += rawTag.length;
          atLineStart = false;
          continue;
        }
      }

      // 6. 块级标记（只在行首有效）
      if (atLineStart) {
        const indentMatch = stickyMatch(RE_INDENT, text, i);
        const indent = indentMatch ? indentMatch[1].length : 0;
        const posAfterIndent = i + indent;

        if (posAfterIndent < len) {
          const charAfterIndent = text.charCodeAt(posAfterIndent);

          // KaTeX 块级公式 $$
          if (
            indent < 4 &&
            charAfterIndent === 36 &&
            posAfterIndent + 1 < len &&
            text.charCodeAt(posAfterIndent + 1) === 36
          ) {
            let startIdx = posAfterIndent + 2;
            let endIdx = startIdx;
            while (endIdx < len) {
              if (
                text.charCodeAt(endIdx) === 36 &&
                endIdx + 1 < len &&
                text.charCodeAt(endIdx + 1) === 36
              ) {
                break;
              }
              endIdx++;
            }
            const formulaContent = text.slice(startIdx, endIdx).trim();
            i = endIdx < len ? endIdx + 2 : endIdx;
            tokens.push({ type: "katex_block", content: formulaContent });
            atLineStart = true;
            continue;
          }

          // 代码围栏 ```
          if (
            indent < 20 &&
            charAfterIndent === 96 &&
            text.startsWith("```", posAfterIndent)
          ) {
            const openMatch = stickyMatch(RE_CODE_FENCE_OPEN, text, posAfterIndent);
            if (openMatch) {
              const language = openMatch[1] || "";
              let currentPos = posAfterIndent + openMatch[0].length;

              if (currentPos < len && text[currentPos] === "\n") {
                currentPos++;
              }

              const contentStart = currentPos;
              let contentEnd = len;
              let closed = false;

              while (currentPos < len) {
                if (text[currentPos] === "\n") {
                  let k = currentPos + 1;
                  let spaceCount = 0;
                  while (k < len && text[k] === " " && spaceCount < 20) {
                    k++;
                    spaceCount++;
                  }
                  if (text.startsWith("```", k)) {
                    contentEnd = currentPos;
                    currentPos = k + 3;
                    closed = true;
                    break;
                  }
                }
                currentPos++;
              }

              let codeContent = text.slice(contentStart, contentEnd);
              if (indent > 0) {
                const dedentRegex = new RegExp(`^ {0,${indent}}`, "gm");
                codeContent = codeContent.replace(dedentRegex, "");
              }

              tokens.push({
                type: "code_fence",
                language,
                raw: codeContent,
                closed,
              });
              i = currentPos;
              atLineStart = true;
              continue;
            }
          }

          // 标题 #
          if (indent < 4 && charAfterIndent === 35) {
            const headingMatch = stickyMatch(RE_HEADING, text, posAfterIndent);
            if (headingMatch) {
              tokens.push({
                type: "heading_marker",
                level: headingMatch[1].length,
                raw: headingMatch[0],
              });
              i = posAfterIndent + headingMatch[0].length;
              atLineStart = false;
              continue;
            }
          }

          // 水平线 ---, ***, ___
          if (indent < 4 && (charAfterIndent === 45 || charAfterIndent === 42 || charAfterIndent === 95)) {
            const hrMatch = stickyMatch(RE_HR, text, posAfterIndent);
            if (hrMatch) {
              tokens.push({ type: "hr_marker", raw: hrMatch[0] });
              i = posAfterIndent + hrMatch[0].length;
              atLineStart = false;
              continue;
            }
          }

          // 列表标记
          const listMatch = stickyMatch(RE_LIST, text, posAfterIndent);
          if (listMatch) {
            tokens.push({
              type: "list_marker",
              ordered: /\d+\./.test(listMatch[1]),
              raw: listMatch[0],
              indent: indent,
            });
            i = posAfterIndent + listMatch[0].length;
            atLineStart = false;
            continue;
          }

          // 引用标记 >
          if (indent < 4 && charAfterIndent === 62) {
            const bqMatch = stickyMatch(RE_BLOCKQUOTE, text, posAfterIndent);
            if (bqMatch) {
              tokens.push({ type: "blockquote_marker", raw: bqMatch[0] });
              i = posAfterIndent + bqMatch[0].length;
              atLineStart = true;
              continue;
            }
          }

          // VCP 工具请求块 <<<[TOOL_REQUEST]>>>
          if (text.startsWith("<<<[TOOL_REQUEST]>>>", posAfterIndent)) {
            const startMarker = "<<<[TOOL_REQUEST]>>>";
            const endMarker = "<<<[END_TOOL_REQUEST]>>>";
            let currentPos = posAfterIndent + startMarker.length;

            const endIdx = text.indexOf(endMarker, currentPos);
            let vcpContent = "";
            let closed = false;

            if (endIdx !== -1) {
              vcpContent = text.slice(currentPos, endIdx);
              currentPos = endIdx + endMarker.length;
              closed = true;
            } else {
              vcpContent = text.slice(currentPos);
              currentPos = len;
              closed = false;
            }

            const args: Record<string, string> = {};
            let tool_name = "";
            let command = "";
            let maid = "";

            let match;
            RE_VCP_ARG.lastIndex = 0;
            let lastMatchEnd = 0;
            while ((match = RE_VCP_ARG.exec(vcpContent)) !== null) {
              const key = match[1];
              const value = match[2];
              if (key === "tool_name") tool_name = value;
              else if (key === "command") command = value;
              else if (key === "maid") maid = value;
              else args[key] = value;
              lastMatchEnd = RE_VCP_ARG.lastIndex;
            }

            const remainingVcp = vcpContent.slice(lastMatchEnd).trim();
            const pendingMatch = remainingVcp.match(RE_VCP_PENDING);
            if (pendingMatch) {
              const key = pendingMatch[1];
              const value = pendingMatch[2];
              if (key === "tool_name") tool_name = tool_name || value;
              else if (key === "command") command = command || value;
              else if (key === "maid") maid = maid || value;
              else if (!args[key]) args[key] = value;
            }

            tokens.push({
              type: "vcp_tool",
              raw: startMarker + vcpContent + (closed ? endMarker : ""),
              closed,
              tool_name,
              command,
              maid,
              args,
            });
            i = currentPos;
            atLineStart = true;
            continue;
          }

          // VCP 调用结果信息汇总 [[VCP调用结果信息汇总:
          if (text.startsWith("[[VCP调用结果信息汇总:", posAfterIndent)) {
            const startMarker = "[[VCP调用结果信息汇总:";
            const endMarker = "VCP调用结果结束]]";
            let currentPos = posAfterIndent + startMarker.length;

            const endIdx = text.indexOf(endMarker, currentPos);
            let vcpContent = "";
            let closed = false;

            if (endIdx !== -1) {
              vcpContent = text.slice(currentPos, endIdx);
              currentPos = endIdx + endMarker.length;
              closed = true;
            } else {
              vcpContent = text.slice(currentPos);
              currentPos = len;
              closed = false;
            }

            let tool_name = "";
            let status = "";
            let resultContent = "";

            let match;
            RE_VCP_RESULT_FIELD.lastIndex = 0;
            while ((match = RE_VCP_RESULT_FIELD.exec(vcpContent)) !== null) {
              const key = match[1] as string;
              const value = match[2].trim();
              if (key === "工具名称") tool_name = value;
              else if (key === "执行状态") status = value;
              else if (key === "返回内容") resultContent = value;
            }

            tokens.push({
              type: "vcp_tool",
              raw: startMarker + vcpContent + (closed ? endMarker : ""),
              closed,
              isResult: true,
              tool_name,
              command: "",
              status,
              resultContent,
              args: {},
            });
            i = currentPos;
            atLineStart = true;
            continue;
          }
        }
      }

      // 7. Markdown 内联定界符
      if (char === 8220) { // “
        tokens.push({ type: "quote_delimiter", marker: "“", raw: "“" });
        i += 1; atLineStart = false; continue;
      }
      if (char === 8221) { // ”
        tokens.push({ type: "quote_delimiter", marker: "”", raw: "”" });
        i += 1; atLineStart = false; continue;
      }
      if (char === 34) { // "
        tokens.push({ type: "quote_delimiter", marker: "\"", raw: "\"" });
        i += 1; atLineStart = false; continue;
      }

      if (char === 126) { // ~
        if (i + 1 < len && text.charCodeAt(i + 1) === 126) {
          tokens.push({ type: "strikethrough_delimiter", marker: "~~", raw: "~~" });
          i += 2;
        } else {
          tokens.push({ type: "subscript_delimiter", marker: "~", raw: "~" });
          i += 1;
        }
        atLineStart = false; continue;
      }

      if (char === 94) { // ^
        tokens.push({ type: "superscript_delimiter", marker: "^", raw: "^" });
        i += 1; atLineStart = false; continue;
      }

      if (char === 42) { // *
        if (i + 2 < len && text.charCodeAt(i + 1) === 42 && text.charCodeAt(i + 2) === 42) {
          tokens.push({ type: "triple_delimiter", marker: "***", raw: "***" });
          i += 3;
        } else if (i + 1 < len && text.charCodeAt(i + 1) === 42) {
          tokens.push({ type: "strong_delimiter", marker: "**", raw: "**" });
          i += 2;
        } else {
          tokens.push({ type: "em_delimiter", marker: "*", raw: "*" });
          i += 1;
        }
        atLineStart = false; continue;
      }

      if (char === 95) { // _
        if (i + 1 < len && text.charCodeAt(i + 1) === 95) {
          tokens.push({ type: "strong_delimiter", marker: "__", raw: "__" });
          i += 2;
        } else {
          tokens.push({ type: "em_delimiter", marker: "_", raw: "_" });
          i += 1;
        }
        atLineStart = false; continue;
      }

      // 8. 行内代码 `
      if (char === 96) {
        let tickCount = 0;
        while (i + tickCount < len && text.charCodeAt(i + tickCount) === 96) {
          tickCount++;
        }

        let contentEndIndex = -1;
        let searchIndex = i + tickCount;
        let searchBoundary = len;
        const paragraphBreakIndex = text.indexOf("\n\n", searchIndex);
        if (paragraphBreakIndex !== -1) searchBoundary = paragraphBreakIndex;

        while (searchIndex < searchBoundary) {
          const nextTickIndex = text.indexOf("`", searchIndex);
          if (nextTickIndex === -1 || nextTickIndex >= searchBoundary) break;

          let currentTickCount = 0;
          let k = nextTickIndex;
          while (k < len && text.charCodeAt(k) === 96) {
            currentTickCount++;
            k++;
          }

          if (currentTickCount === tickCount) {
            contentEndIndex = nextTickIndex;
            break;
          }
          searchIndex = k;
        }

        if (contentEndIndex !== -1) {
          let content = text.slice(i + tickCount, contentEndIndex);
          if (content.length >= 2 && content.startsWith(" ") && content.endsWith(" ") && content.trim().length > 0) {
            content = content.slice(1, -1);
          }
          tokens.push({ type: "inline_code", content });
          i = contentEndIndex + tickCount;
          atLineStart = false;
          continue;
        } else {
          tokens.push({ type: "text", content: "`" });
          i += 1;
          atLineStart = false;
          continue;
        }
      }

      // 9. KaTeX 公式 $
      if (char === 36) {
        // $$
        if (i + 1 < len && text.charCodeAt(i + 1) === 36) {
          const startIdx = i + 2;
          let endIdx = startIdx;
          while (endIdx < len) {
            if (text.charCodeAt(endIdx) === 36 && endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 36) {
              break;
            }
            endIdx++;
          }
          const formulaContent = text.slice(startIdx, endIdx).trim();
          i = endIdx < len ? endIdx + 2 : endIdx;
          tokens.push({ type: "katex_block", content: formulaContent });
          atLineStart = false;
          continue;
        }
        // $
        const formulaMatch = stickyMatch(RE_KATEX_INLINE, text, i);
        if (formulaMatch) {
          tokens.push({ type: "katex_inline", content: formulaMatch[1] });
          i += formulaMatch[0].length;
          atLineStart = false;
          continue;
        }
        tokens.push({ type: "text", content: "$" });
        i += 1;
        atLineStart = false;
        continue;
      }

      // 10. 图片与链接 ![, [, ], (, )
      if (char === 33 && i + 1 < len && text.charCodeAt(i + 1) === 91) {
        tokens.push({ type: "image_marker", raw: "!" });
        i += 1; atLineStart = false; continue;
      }
      if (char === 91) { tokens.push({ type: "link_text_open", raw: "[" }); i += 1; atLineStart = false; continue; }
      if (char === 93) { tokens.push({ type: "link_text_close", raw: "]" }); i += 1; atLineStart = false; continue; }
      if (char === 40) { tokens.push({ type: "link_url_open", raw: "(" }); i += 1; atLineStart = false; continue; }
      if (char === 41) { tokens.push({ type: "link_url_close", raw: ")" }); i += 1; atLineStart = false; continue; }

      // 11. 普通文本收集
      RE_SPECIAL_CHARS.lastIndex = i;
      const match = RE_SPECIAL_CHARS.exec(text);

      if (!match) {
        tokens.push({ type: "text", content: text.slice(i) });
        i = len;
      } else if (match.index > i) {
        tokens.push({ type: "text", content: text.slice(i, match.index) });
        i = match.index;
        atLineStart = false;
      } else {
        tokens.push({ type: "text", content: text[i] });
        i++;
        atLineStart = false;
      }
    }

    return tokens;
  }

  private parseAttributes(attrString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    RE_ATTR.lastIndex = 0;
    let match;
    while ((match = RE_ATTR.exec(attrString)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || "";
      attributes[key] = value;
    }
    return attributes;
  }
}
