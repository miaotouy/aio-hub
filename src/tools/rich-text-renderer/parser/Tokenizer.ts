import { Token } from "./types";

// ============ 分词器 (性能优化版) ============

/**
 * 辅助函数：使用 sticky 正则匹配
 * Sticky 模式允许正则直接从指定位置开始匹配，避免了创建字符串切片的开销。
 */
function stickyMatch(regex: RegExp, text: string, pos: number): RegExpExecArray | null {
  regex.lastIndex = pos;
  return regex.exec(text);
}

// 预编译正则表达式（带 sticky 标志，提升匹配性能）
const RE_HTML_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)\s*((?:"[^"]*"|'[^']*'|[^>/"'])*)\s*(\/?)\>/y;
const RE_MATHJAX_INLINE = /\\\((.*?)\\\)/y;
const RE_ESCAPE_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const RE_AUTOLINK = /<((?:https?|ftps?|mailto):[^\s>]+)>/y;
const RE_URL = /(https?:\/\/[^\s<"“'”]+)/y;
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
// VCP (Variable & Command Protocol) 协议相关正则: https://github.com/lioensky/VCPToolBox
// 变体优先级: ESCAPE > exp > 标准，ESCAPE/exp 内容中可包含标准 VCP 协议字符（如 「始」/「末」）
const RE_VCP_ARG_ESCAPE = /([a-zA-Z0-9_-]+):「始ESCAPE」([\s\S]*?)「末ESCAPE」/g;
const RE_VCP_ARG_EXP = /([a-zA-Z0-9_-]+):「始exp」([\s\S]*?)「末exp」/g;
const RE_VCP_ARG = /([a-zA-Z0-9_-]+):「始」([\s\S]*?)「末」/g;
const RE_VCP_PENDING = /([a-zA-Z0-9_-]+):「始(?:ESCAPE|exp)?」([\s\S]*)$/;
const RE_VCP_RESULT_FIELD =
  /-\s*(工具名称|执行状态|返回内容):\s*([\s\S]*?)(?=\n-\s*(?:工具名称|执行状态|返回内容):|\nVCP调用结果结束\]\]|$)/g;
const RE_VCP_ROLE_OPEN = /<<<\[ROLE_DIVIDE_(USER|ASSISTANT|SYSTEM)\]>>>/y;
const RE_VCP_DAILY_NOTE_OPEN = /<<<DailyNoteStart>>>/y;

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

  private static readonly rawElements = new Set(["code", "pre", "script", "style"]);

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

        if (char === 60) {
          // '<'
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

      // 4. 转义字符 (优先级调高，以防 Windows 路径中的 \[ 被误认为 MathJax)
      if (char === 92) {
        // 先检查是否是转义标点
        if (i + 1 < len && RE_ESCAPE_PUNCT.test(text[i + 1])) {
          // 在转义之前，我们先尝试匹配 MathJax
          // 只有在不是常见的转义场景（如 \[ \] \( \)）或者 MathJax 匹配失败时，才走转义

          // 尝试 MathJax 块级公式 \[...\]
          if (text.charCodeAt(i + 1) === 91) {
            const startIdx = i + 2;
            let endIdx = startIdx;
            let found = false;
            while (endIdx < len) {
              if (text.charCodeAt(endIdx) === 92 && endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 93) {
                found = true;
                break;
              }
              endIdx++;
            }
            // 只有当公式内容不包含明显的路径特征（如反斜杠，且长度合理）时才认为是公式
            const formulaContent = text.slice(startIdx, endIdx);
            // 启发式判断：如果包含盘符特征（如 G:\ 或 C:/），则极大概率是 Windows 路径而不是公式
            const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(formulaContent);
            // 如果包含大量的反斜杠且没有 LaTeX 关键字，也倾向于是路径
            const hasLatexKeywords = /\\(?:frac|sum|sqrt|alpha|beta|gamma|delta|theta|pi|infty|int)/.test(
              formulaContent,
            );

            if (
              found &&
              formulaContent.length < 2000 &&
              !isWindowsPath &&
              (hasLatexKeywords || !formulaContent.includes("\\"))
            ) {
              i = endIdx + 2;
              tokens.push({ type: "katex_block", content: formulaContent.trim() });
              atLineStart = false;
              continue;
            }
          }

          // 尝试 MathJax 行内公式 \(...\)
          if (text.charCodeAt(i + 1) === 40) {
            const mathjaxMatch = stickyMatch(RE_MATHJAX_INLINE, text, i);
            if (mathjaxMatch) {
              const formulaContent = mathjaxMatch[1];
              if (!formulaContent.includes("\n") && !formulaContent.includes("\\") && formulaContent.length < 500) {
                tokens.push({ type: "katex_inline", content: formulaContent });
                i += mathjaxMatch[0].length;
                atLineStart = false;
                continue;
              }
            }
          }

          // 否则，作为普通转义字符
          // 启发式：如果后面跟着 [ 且前面看起来像 Windows 盘符，则不转义，保留反斜杠
          // 这样可以保护像 G:\[... 这样的路径
          const isWindowsPathEscape = text[i + 1] === "[" && i > 1 && text[i - 1] === ":";
          if (isWindowsPathEscape) {
            tokens.push({ type: "text", content: "\\" });
            i += 1;
          } else {
            tokens.push({ type: "text", content: text[i + 1] });
            i += 2;
          }
        } else {
          tokens.push({ type: "text", content: "\\" });
          i += 1;
        }
        atLineStart = false;
        continue;
      }

      // 5. URL, Autolink, Comment, HTML Tag
      if (char === 104) {
        // 'h'
        const urlMatch = stickyMatch(RE_URL, text, i);
        if (urlMatch) {
          let url = urlMatch[1];
          // 移除末尾可能被误匹配的标点符号
          const trailingPunct = /[.,!?;:]+$/;
          const punctMatch = url.match(trailingPunct);
          if (punctMatch) {
            url = url.slice(0, -punctMatch[0].length);
          }
          tokens.push({ type: "autolink", url, raw: url });
          i += url.length;
          atLineStart = false;
          continue;
        }
      }

      if (char === 60) {
        // '<'
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
            // 只有当存在对应的闭合标签时，才进入 raw 模式
            // 这可以防止孤立的 <style> 标签吞噬掉后续的所有 Markdown 内容
            if (!isSelfClosing && Tokenizer.rawElements.has(tagName)) {
              const closeTag = `</${tagName}>`;
              if (text.toLowerCase().indexOf(closeTag, i + rawTag.length) !== -1) {
                rawTagStack.push(tagName);
              }
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
            // 启发式：如果后面紧跟数字（如 $$1.85），极大概率是金额而非公式起始
            const nextChar = posAfterIndent + 2 < len ? text.charCodeAt(posAfterIndent + 2) : -1;
            const isMoneyPattern = nextChar >= 48 && nextChar <= 57;

            if (!isMoneyPattern) {
              let startIdx = posAfterIndent + 2;
              let endIdx = startIdx;
              let found = false;

              // 寻找闭合的 $$，但不能跨越段落或 VCP 边界
              while (endIdx < len) {
                // 检查闭合标记
                if (text.charCodeAt(endIdx) === 36 && endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 36) {
                  found = true;
                  break;
                }
                // 检查边界：段落分隔、VCP 角色切换、工具请求
                if (text.charCodeAt(endIdx) === 10) {
                  if (endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 10) break; // \n\n
                }
                if (text.startsWith("<<<", endIdx) || text.startsWith("[[VCP", endIdx)) {
                  break;
                }
                endIdx++;
              }

              if (found) {
                const formulaContent = text.slice(startIdx, endIdx).trim();
                i = endIdx + 2;
                tokens.push({ type: "katex_block", content: formulaContent });
                atLineStart = true;
                continue;
              }
            }
            // 如果没找到闭合或被判定为金额，则回退，让后续逻辑处理（可能会被识别为 text 或内联公式）
          }

          // 代码围栏 ```
          if (indent < 20 && charAfterIndent === 96 && text.startsWith("```", posAfterIndent)) {
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

          // VCP 角色分割围栏 <<<[ROLE_DIVIDE_XXX]>>> / <<<[END_ROLE_DIVIDE_XXX]>>>
          if (charAfterIndent === 60 && text.startsWith("<<<[ROLE_DIVIDE_", posAfterIndent)) {
            const roleMatch = stickyMatch(RE_VCP_ROLE_OPEN, text, posAfterIndent);
            if (roleMatch) {
              const role = roleMatch[1].toLowerCase() as "user" | "assistant" | "system";
              const startMarker = roleMatch[0];
              const endMarker = `<<<[END_ROLE_DIVIDE_${roleMatch[1]}]>>>`;

              let currentPos = posAfterIndent + startMarker.length;
              const endIdx = text.indexOf(endMarker, currentPos);
              let content = "";
              let closed = false;

              if (endIdx !== -1) {
                content = text.slice(currentPos, endIdx);
                currentPos = endIdx + endMarker.length;
                closed = true;
              } else {
                content = text.slice(currentPos);
                currentPos = len;
                closed = false;
              }

              tokens.push({
                type: "vcp_role",
                role,
                content,
                closed,
                raw: startMarker + content + (closed ? endMarker : ""),
              });
              i = currentPos;
              atLineStart = true;
              continue;
            }
          }

          // VCP 工具请求块 <<<[TOOL_REQUEST]>>> / <<<[TOOL_REQUEST_ESCAPE]>>> (Protocol: https://github.com/lioensky/VCPToolBox)
          // TOOL_REQUEST_ESCAPE 用于嵌套工具调用，其内容中的 <<<[TOOL_REQUEST]>>> 不会被再次解析
          const isEscapeBlock = text.startsWith("<<<[TOOL_REQUEST_ESCAPE]>>>", posAfterIndent);
          if (isEscapeBlock || text.startsWith("<<<[TOOL_REQUEST]>>>", posAfterIndent)) {
            const startMarker = isEscapeBlock ? "<<<[TOOL_REQUEST_ESCAPE]>>>" : "<<<[TOOL_REQUEST]>>>";
            const endMarker = isEscapeBlock ? "<<<[END_TOOL_REQUEST_ESCAPE]>>>" : "<<<[END_TOOL_REQUEST]>>>";
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

            // 第一步：优先解析 ESCAPE/exp 变体（内容可含标准 VCP 字符，必须先处理）
            // 记录已匹配的字符范围，防止后续标准正则重复处理
            const matchedRanges: Array<[number, number]> = [];

            const parseEscapeVariant = (regex: RegExp) => {
              let match;
              regex.lastIndex = 0;
              while ((match = regex.exec(vcpContent)) !== null) {
                const key = match[1];
                const value = match[2];
                matchedRanges.push([match.index, regex.lastIndex]);
                if (key === "tool_name") tool_name = value;
                else if (key === "command") command = value;
                else if (key === "maid") maid = value;
                else args[key] = value;
              }
            };

            parseEscapeVariant(RE_VCP_ARG_ESCAPE);
            parseEscapeVariant(RE_VCP_ARG_EXP);

            // 第二步：构建去除已匹配范围的内容，再用标准正则扫描
            matchedRanges.sort((a, b) => a[0] - b[0]);
            let maskedContent = vcpContent;
            // 从后往前替换，避免偏移量变化
            for (let ri = matchedRanges.length - 1; ri >= 0; ri--) {
              const [start, end] = matchedRanges[ri];
              maskedContent = maskedContent.slice(0, start) + " ".repeat(end - start) + maskedContent.slice(end);
            }

            let match;
            RE_VCP_ARG.lastIndex = 0;
            let lastMatchEnd = 0;
            while ((match = RE_VCP_ARG.exec(maskedContent)) !== null) {
              const key = match[1];
              const value = match[2];
              // 使用原始 vcpContent 中对应位置的真实值
              const realValue = vcpContent
                .slice(match.index, RE_VCP_ARG.lastIndex)
                .match(/([a-zA-Z0-9_-]+):「始」([\s\S]*?)「末」/);
              const actualValue = realValue ? realValue[2] : value;
              if (key === "tool_name") tool_name = tool_name || actualValue;
              else if (key === "command") command = command || actualValue;
              else if (key === "maid") maid = maid || actualValue;
              else if (!args[key]) args[key] = actualValue;
              lastMatchEnd = RE_VCP_ARG.lastIndex;
            }

            const remainingVcp = maskedContent.slice(lastMatchEnd).trim();
            const pendingMatch = remainingVcp.match(RE_VCP_PENDING);
            if (pendingMatch) {
              const key = pendingMatch[1];
              // pending 情形取原始内容中对应的值
              const pendingStart = maskedContent.lastIndexOf(pendingMatch[0].trim());
              const rawPendingMatch = pendingStart >= 0 ? vcpContent.slice(pendingStart).match(RE_VCP_PENDING) : null;
              const value = rawPendingMatch ? rawPendingMatch[2] : pendingMatch[2];
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

          // 日记围栏 <<<DailyNoteStart>>> / <<<DailyNoteEnd>>>
          const dailyNoteMatch = stickyMatch(RE_VCP_DAILY_NOTE_OPEN, text, posAfterIndent);
          if (dailyNoteMatch) {
            const startMarker = dailyNoteMatch[0];
            const endMarker = "<<<DailyNoteEnd>>>";
            let currentPos = posAfterIndent + startMarker.length;

            const endIdx = text.indexOf(endMarker, currentPos);
            let content = "";
            let closed = false;

            if (endIdx !== -1) {
              content = text.slice(currentPos, endIdx);
              currentPos = endIdx + endMarker.length;
              closed = true;
            } else {
              content = text.slice(currentPos);
              currentPos = len;
              closed = false;
            }

            tokens.push({
              type: "vcp_daily_note",
              content,
              closed,
              raw: startMarker + content + (closed ? endMarker : ""),
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
      if (char === 8220) {
        // “
        tokens.push({ type: "quote_delimiter", marker: "“", raw: "“" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (char === 8221) {
        // ”
        tokens.push({ type: "quote_delimiter", marker: "”", raw: "”" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (char === 34) {
        // "
        tokens.push({ type: "quote_delimiter", marker: '"', raw: '"' });
        i += 1;
        atLineStart = false;
        continue;
      }

      if (char === 126) {
        // ~ (下标或删除线)
        const isWordCharacter = (code: number) =>
          (code >= 48 && code <= 57) || // 0-9
          (code >= 65 && code <= 90) || // A-Z
          (code >= 97 && code <= 122) || // a-z
          code > 127; // 中文等非 ASCII 字符

        const isWhitespace = (code: number) => code <= 32;

        // 标点符号判断 (包含中文标点)
        const isPunctuation = (code: number) => {
          // 常见标点：! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
          if (code >= 33 && code <= 47) return true;
          if (code >= 58 && code <= 64) return true;
          if (code >= 91 && code <= 96) return true;
          if (code >= 123 && code <= 126) return true;
          // 中文标点范围 (部分常用)
          if (code >= 0x3000 && code <= 0x303f) return true; // 句号、逗号等
          if (code >= 0xff00 && code <= 0xffef) return true; // 全角标点
          return false;
        };

        const prevChar = i > 0 ? text.charCodeAt(i - 1) : -1;
        const nextChar = i + 1 < len ? text.charCodeAt(i + 1) : -1;

        if (nextChar === 126) {
          // ~~ (删除线)
          const nextNextChar = i + 2 < len ? text.charCodeAt(i + 2) : -1;
          // 如果两侧都是词内字符，则不视为删除线
          if (isWordCharacter(prevChar) && isWordCharacter(nextNextChar)) {
            tokens.push({ type: "text", content: "~~" });
          } else {
            tokens.push({ type: "strikethrough_delimiter", marker: "~~", raw: "~~" });
          }
          i += 2;
        } else {
          // ~ (下标)
          // 语气助词保护：如果 ~ 右侧是标点符号或空白，或者两侧都是词内字符，则不视为下标
          if (
            (isWordCharacter(prevChar) && isWordCharacter(nextChar)) ||
            (isWhitespace(prevChar) && isWhitespace(nextChar)) ||
            isPunctuation(nextChar) ||
            isWhitespace(nextChar) ||
            nextChar === -1 // 文本末尾
          ) {
            tokens.push({ type: "text", content: "~" });
          } else {
            tokens.push({ type: "subscript_delimiter", marker: "~", raw: "~" });
          }
          i += 1;
        }
        atLineStart = false;
        continue;
      }

      if (char === 94) {
        // ^
        tokens.push({ type: "superscript_delimiter", marker: "^", raw: "^" });
        i += 1;
        atLineStart = false;
        continue;
      }

      if (char === 42) {
        // *
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
        atLineStart = false;
        continue;
      }

      if (char === 95) {
        // _
        if (i + 1 < len && text.charCodeAt(i + 1) === 95) {
          tokens.push({ type: "strong_delimiter", marker: "__", raw: "__" });
          i += 2;
        } else {
          // GFM 风格的词内强调限制 (Intra-word emphasis restriction)
          // 如果下划线两侧都是字母或数字，则不视为强调标记，而是作为普通文本
          const prevChar = i > 0 ? text.charCodeAt(i - 1) : -1;
          const nextChar = i + 1 < len ? text.charCodeAt(i + 1) : -1;

          const isAlphanumeric = (code: number) =>
            (code >= 48 && code <= 57) || // 0-9
            (code >= 65 && code <= 90) || // A-Z
            (code >= 97 && code <= 122); // a-z

          if (isAlphanumeric(prevChar) && isAlphanumeric(nextChar)) {
            tokens.push({ type: "text", content: "_" });
          } else {
            tokens.push({ type: "em_delimiter", marker: "_", raw: "_" });
          }
          i += 1;
        }
        atLineStart = false;
        continue;
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
          // 启发式：如果后面紧跟数字（如 $$1.85），极大概率是金额而非公式起始
          const nextChar = i + 2 < len ? text.charCodeAt(i + 2) : -1;
          const isMoneyPattern = nextChar >= 48 && nextChar <= 57;

          if (!isMoneyPattern) {
            const startIdx = i + 2;
            let endIdx = startIdx;
            let found = false;

            // 寻找闭合的 $$，但不能跨越段落或 VCP 边界
            while (endIdx < len) {
              if (text.charCodeAt(endIdx) === 36 && endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 36) {
                found = true;
                break;
              }
              // 检查边界
              if (text.charCodeAt(endIdx) === 10) {
                if (endIdx + 1 < len && text.charCodeAt(endIdx + 1) === 10) break; // \n\n
              }
              if (text.startsWith("<<<", endIdx) || text.startsWith("[[VCP", endIdx)) {
                break;
              }
              endIdx++;
            }

            if (found) {
              const formulaContent = text.slice(startIdx, endIdx).trim();
              i = endIdx + 2;
              tokens.push({ type: "katex_block", content: formulaContent });
              atLineStart = false;
              continue;
            }
          }
          // 如果没找到闭合或判定为金额，则作为普通文本处理第一个 $，循环继续会处理第二个 $
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
        i += 1;
        atLineStart = false;
        continue;
      }
      if (char === 91) {
        tokens.push({ type: "link_text_open", raw: "[" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (char === 93) {
        tokens.push({ type: "link_text_close", raw: "]" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (char === 40) {
        // 优化：如果是链接或图片的 URL 部分 (紧跟在 ] 之后)
        // 我们贪婪地匹配到闭合括号，以保护其中的 Windows 路径不被转义逻辑破坏
        const prevToken = tokens[tokens.length - 1];
        if (prevToken && prevToken.type === "link_text_close") {
          let depth = 1;
          let j = i + 1;
          while (j < len && depth > 0) {
            if (text.charCodeAt(j) === 40)
              depth++; // (
            else if (text.charCodeAt(j) === 41) depth--; // )
            j++;
          }
          if (depth === 0) {
            const urlContent = text.slice(i + 1, j - 1);
            tokens.push({ type: "link_url_open", raw: "(" });
            tokens.push({ type: "text", content: urlContent });
            tokens.push({ type: "link_url_close", raw: ")" });
            i = j;
            atLineStart = false;
            continue;
          }
        }

        tokens.push({ type: "link_url_open", raw: "(" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (char === 41) {
        tokens.push({ type: "link_url_close", raw: ")" });
        i += 1;
        atLineStart = false;
        continue;
      }

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
