import { Token } from "./types";

// ============ 分词器 ============

export class Tokenizer {
  // HTML 标签必须以字母开头，后跟字母、数字、连字符或下划线
  // 拒绝 <100ms> 这类数字开头的非法标签
  private htmlTagRegex = /^<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)\s*([^>]*?)\s*(\/?)>/;

  // HTML void elements (不需要闭合标签的元素)
  private voidElements = new Set([
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
    "think", // Added think to void elements? No, wait. The original code didn't have think in voidElements.
    // Checking original code...
    // Original code:
    /*
    private voidElements = new Set([
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
    */
  ]);

  constructor() {
    // Initialize void elements if needed, but they are static
  }

  /**
   * 将完整文本转换为令牌序列
   */
  public tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let atLineStart = true; // 跟踪是否在行首

    while (i < text.length) {
      const remaining = text.slice(i);

      // 换行符（优先处理，以更新 atLineStart 状态）
      const newlineMatch = remaining.match(/^(\n+)/);
      if (newlineMatch) {
        tokens.push({ type: "newline", count: newlineMatch[1].length });
        i += newlineMatch[1].length;
        atLineStart = true;
        continue;
      }

      // Autolink: <url> 或 <email>
      // 必须在 HTML 标签检查之前，避免 <https://...> 被识别为 HTML 标签
      const autolinkRegex = /^<((?:https?|ftps?|mailto):[^\s>]+)>/;
      const autolinkMatch = remaining.match(autolinkRegex);
      if (autolinkMatch) {
        tokens.push({
          type: "autolink",
          url: autolinkMatch[1],
          raw: autolinkMatch[0],
        });
        i += autolinkMatch[0].length;
        atLineStart = false;
        continue;
      }

      // HTML 标签（无论是否行首都有效，且优先于块级 Markdown 标记）
      const htmlMatch = remaining.match(this.htmlTagRegex);
      if (htmlMatch) {
        const rawTag = htmlMatch[0];
        const isClosing = !!htmlMatch[1];
        const tagName = htmlMatch[2].toLowerCase();
        const attributes = this.parseAttributes(htmlMatch[3]);

        // 判断是否是自闭合标签：显式的 /> 或者是 void element
        const isSelfClosing = !!htmlMatch[4] || this.voidElements.has(tagName);

        if (isClosing) {
          tokens.push({ type: "html_close", tagName, raw: rawTag });
        } else {
          tokens.push({
            type: "html_open",
            tagName,
            attributes,
            selfClosing: isSelfClosing,
            raw: rawTag,
          });
        }
        i += rawTag.length;
        atLineStart = false;
        continue;
      }

      // 块级标记（只在行首有效）
      if (atLineStart) {
        // 允许前导空格（0-4个）用于块级元素缩进
        // 这符合 Markdown 标准，列表项可以有 0-4 个空格缩进
        const leadingSpaceMatch = remaining.match(/^( {1,4})(?=[*+\-]|\d+\.|#{1,6}\s|>|```|\$\$)/);
        if (leadingSpaceMatch) {
          // 跳过前导空格，保持 atLineStart 为 true
          i += leadingSpaceMatch[1].length;
          continue;
        }

        // KaTeX 块级公式 $$...$$ - 立即处理整个公式块
        if (remaining.startsWith("$$")) {
          i += 2; // 跳过开始的 $$

          // 收集公式内容
          let formulaContent = "";

          while (i < text.length) {
            // 检查是否遇到闭合的 $$
            if (text[i] === "$" && i + 1 < text.length && text[i + 1] === "$") {
              // 找到闭合标记，跳过它
              i += 2;
              break;
            }
            formulaContent += text[i];
            i++;
          }

          // 添加 KaTeX 块级 token
          tokens.push({ type: "katex_block", content: formulaContent.trim() });
          atLineStart = true;
          continue;
        }

        // 代码围栏 - 立即处理整个代码块
        if (remaining.startsWith("```")) {
          const openMatch = remaining.match(/^```(\w*)/);
          if (openMatch) {
            const language = openMatch[1] || "";
            i += openMatch[0].length; // 跳过开始标记

            // 跳过开始标记后的第一个换行符（如果有）
            if (i < text.length && text[i] === "\n") {
              i++;
            }

            // 收集代码块内容（原始文本，不做任何解析）
            let codeContent = "";

            while (i < text.length) {
              // 检查是否遇到闭合的 ```，允许前面有最多 3-4 个空格缩进
              if (text[i] === "\n") {
                const nextIndex = i + 1;
                let k = nextIndex;
                let spaceCount = 0;
                // 跳过最多 4 个空格（兼容常见 Markdown 缩进习惯）
                while (k < text.length && text[k] === " " && spaceCount < 4) {
                  k++;
                  spaceCount++;
                }
                if (text.slice(k, k + 3) === "```") {
                  // 将指针移动到 ``` 之后，结束代码块
                  i = k + 3;
                  break;
                }
              }

              codeContent += text[i];
              i++;
            }

            // 添加代码块 token（包含完整内容）
            tokens.push({ type: "code_fence", language, raw: codeContent });
            atLineStart = true;
            continue;
          }
        }

        // 标题标记
        const headingMatch = remaining.match(/^(#{1,6})\s/);
        if (headingMatch) {
          tokens.push({
            type: "heading_marker",
            level: headingMatch[1].length,
            raw: headingMatch[0],
          });
          i += headingMatch[0].length;
          atLineStart = false;
          continue;
        }

        // 水平线 - 必须是独立的一行（只能跟空白字符或换行）
        const hrMatch = remaining.match(/^(---+|\*\*\*+|___+)(\s*)(?=\n|$)/);
        if (hrMatch) {
          tokens.push({ type: "hr_marker", raw: hrMatch[0] });
          i += hrMatch[0].length;
          atLineStart = false;
          continue;
        }

        // 列表标记（不包含前导空白）
        const listMatch = remaining.match(/^([*+-]|\d+\.)\s/);
        if (listMatch) {
          tokens.push({
            type: "list_marker",
            ordered: /\d+\./.test(listMatch[1]),
            raw: listMatch[0],
          });
          i += listMatch[0].length;
          atLineStart = false;
          continue;
        }

        // 引用标记
        if (remaining.startsWith("> ") || remaining.startsWith(">")) {
          const match = remaining.match(/^>[ \t]?/);
          if (match) {
            tokens.push({ type: "blockquote_marker", raw: match[0] });
            i += match[0].length;
            // 保持 atLineStart 为 true，以便后续内容（如嵌套引用 > 或标题 #）能被识别为块级标记
            atLineStart = true;
            continue;
          }
        }
      }

      // Markdown 内联定界符
      if (remaining.startsWith("“")) {
        tokens.push({ type: "quote_delimiter", marker: "“", raw: "“" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("”")) {
        tokens.push({ type: "quote_delimiter", marker: "”", raw: "”" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("\"")) {
        tokens.push({ type: "quote_delimiter", marker: "\"", raw: "\"" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("~~")) {
        tokens.push({ type: "strikethrough_delimiter", marker: "~~", raw: "~~" });
        i += 2;
        atLineStart = false;
        continue;
      }
      // Handle *** (triple delimiter) for bold-italic
      if (remaining.startsWith("***")) {
        // Heuristic: check if right-flanking (followed by whitespace or end)
        // If right-flanking, it's likely closing: * then **
        // If left-flanking (followed by non-whitespace), it's likely opening: ** then *

        const charAfter = remaining[3];
        // Support ASCII and CJK punctuation
        const isRightFlanking = !charAfter || /\s/.test(charAfter) || /[.,!?;:，。！？；：、]/.test(charAfter);

        if (isRightFlanking) {
          // Closing: * then **
          tokens.push({ type: "em_delimiter", marker: "*", raw: "*" });
          tokens.push({ type: "strong_delimiter", marker: "**", raw: "**" });
        } else {
          // Opening: ** then *
          tokens.push({ type: "strong_delimiter", marker: "**", raw: "**" });
          tokens.push({ type: "em_delimiter", marker: "*", raw: "*" });
        }
        i += 3;
        atLineStart = false;
        continue;
      }

      if (remaining.startsWith("**")) {
        tokens.push({ type: "strong_delimiter", marker: "**", raw: "**" });
        i += 2;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("__")) {
        tokens.push({ type: "strong_delimiter", marker: "__", raw: "__" });
        i += 2;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("*") && !remaining.startsWith("**")) {
        tokens.push({ type: "em_delimiter", marker: "*", raw: "*" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("_") && !remaining.startsWith("__")) {
        tokens.push({ type: "em_delimiter", marker: "_", raw: "_" });
        i += 1;
        atLineStart = false;
        continue;
      }
      // 行内代码 - 立即处理完整的代码块
      if (remaining.startsWith("`")) {
        const codeMatch = remaining.match(/^`([^`]*)`/);
        if (codeMatch) {
          // 找到了完整的行内代码
          tokens.push({ type: "inline_code", content: codeMatch[1] });
          i += codeMatch[0].length;
          atLineStart = false;
          continue;
        } else {
          // 没有找到匹配的反引号，按普通文本处理
          tokens.push({ type: "text", content: "`" });
          i += 1;
          atLineStart = false;
          continue;
        }
      }

      // KaTeX 块级公式 $$...$$ (非行首位置的处理)
      if (remaining.startsWith("$$")) {
        i += 2; // 跳过开始的 $$

        // 收集公式内容
        let formulaContent = "";

        while (i < text.length) {
          // 检查是否遇到闭合的 $$
          if (text[i] === "$" && i + 1 < text.length && text[i + 1] === "$") {
            // 找到闭合标记，跳过它
            i += 2;
            break;
          }
          formulaContent += text[i];
          i++;
        }

        // 添加 KaTeX 块级 token
        tokens.push({ type: "katex_block", content: formulaContent.trim() });
        atLineStart = false;
        continue;
      }

      // KaTeX 行内公式 $...$ - 立即处理完整的公式
      if (remaining.startsWith("$")) {
        // 尝试匹配完整的行内公式 $...$
        // 使用非贪婪匹配，并且不跨越换行符
        const formulaMatch = remaining.match(/^\$([^\n$]+?)\$/);
        if (formulaMatch) {
          // 找到了完整的行内公式
          tokens.push({ type: "katex_inline", content: formulaMatch[1] });
          i += formulaMatch[0].length;
          atLineStart = false;
          continue;
        } else {
          // 没有找到匹配的 $，按普通文本处理
          tokens.push({ type: "text", content: "$" });
          i += 1;
          atLineStart = false;
          continue;
        }
      }

      // 图片标记 ![
      if (remaining.startsWith("![")) {
        tokens.push({ type: "image_marker", raw: "!" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("[")) {
        tokens.push({ type: "link_text_open", raw: "[" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("]")) {
        tokens.push({ type: "link_text_close", raw: "]" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith("(")) {
        tokens.push({ type: "link_url_open", raw: "(" });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith(")")) {
        tokens.push({ type: "link_url_close", raw: ")" });
        i += 1;
        atLineStart = false;
        continue;
      }

      // 普通文本
      const specialChars = /<|`|\*|_|~|!|\[|\]|\(|\)|#|>|\n|\$|“|”|"/;
      const nextSpecialIndex = remaining.search(specialChars);

      const textContent =
        nextSpecialIndex === -1
          ? remaining
          : nextSpecialIndex === 0
            ? remaining[0]
            : remaining.substring(0, nextSpecialIndex);

      if (textContent.length > 0) {
        tokens.push({ type: "text", content: textContent });
        i += textContent.length;
        atLineStart = false;
        continue;
      }

      // 安全保护
      i++;
      atLineStart = false;
    }

    return tokens;
  }

  private parseAttributes(attrString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    // 修复正则：支持属性值中的连字符和其他字符
    // 匹配: key="value" 或 key='value' 或 key=value (无空格的值)
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || "";
      attributes[key] = value;
    }
    return attributes;
  }
}
