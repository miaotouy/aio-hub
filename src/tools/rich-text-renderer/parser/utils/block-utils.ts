import { Token } from "../types";

export const BLOCK_LEVEL_TAGS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "blockquote",
  "pre",
  "table",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "details",
  "summary",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "form",
  "fieldset",
  "legend",
  "iframe",
  "video",
  "audio",
  "canvas",
  "noscript",
  "script",
  "style",
]);

export function isBlockLevelTag(tagName: string): boolean {
  return BLOCK_LEVEL_TAGS.has(tagName);
}

/**
 * 检测 token 序列是否包含块级结构
 */
export function hasBlockLevelStructure(tokens: Token[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // 双换行表示块级分隔
    if (t.type === "newline" && t.count >= 2) {
      return true;
    }

    // 块级标记
    if (
      t.type === "heading_marker" ||
      t.type === "hr_marker" ||
      t.type === "code_fence" ||
      t.type === "list_marker" ||
      t.type === "blockquote_marker"
    ) {
      return true;
    }

    // 块级 HTML 标签
    if (t.type === "html_open") {
      if (isBlockLevelTag(t.tagName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查是否是块级元素的开始（用于中断段落或列表项）
 */
export function isBlockStart(token: Token): boolean {
  if (
    token.type === "heading_marker" ||
    token.type === "hr_marker" ||
    token.type === "code_fence" ||
    token.type === "katex_block" ||
    token.type === "list_marker" ||
    token.type === "blockquote_marker"
  ) {
    return true;
  }

  if (token.type === "html_open" && isBlockLevelTag(token.tagName)) {
    return true;
  }

  return false;
}

/**
 * 检查是否是表格开始
 */
export function isTableStart(tokens: Token[], index: number): boolean {
  // 简单检测：查找包含 | 的行，后跟分隔行
  let i = index;
  let hasContent = false;
  let hasPipe = false;

  // 检查第一行是否包含 |
  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === "newline") {
      break;
    }

    if (t.type === "text") {
      hasContent = true;
      if (t.content.includes("|")) {
        hasPipe = true;
      }
    }

    i++;
  }

  if (!hasPipe || !hasContent) {
    return false;
  }

  // 跳过换行
  if (i < tokens.length && tokens[i].type === "newline") {
    i++;
  }

  // 检查下一行是否是分隔符行
  let separatorLine = "";
  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === "newline") {
      break;
    }

    if (t.type === "text") {
      separatorLine += t.content;
    }

    i++;
  }

  // 分隔符行应该匹配 |---:|:---|:---:| 等模式
  return /^\|?[\s:-]+\|/.test(separatorLine.trim());
}
