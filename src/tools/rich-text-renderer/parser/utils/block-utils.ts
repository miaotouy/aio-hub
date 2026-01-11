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
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "th",
  "td",
  // SVG 标签 (SVG 内部元素应作为块级处理以保持结构)
  "svg",
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "g",
  "defs",
  "symbol",
  "use",
  "animate",
  "animateTransform",
  "animateMotion",
  "mpath",
  "set",
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
      t.type === "katex_block" ||
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

    // 检查表格
    if (isTableStart(tokens, i)) {
      return true;
    }

    // 检查文本内容中的块级特征 (针对 Tokenizer 未识别为块级 Token 的情况)
    if (t.type === "text") {
      const content = t.content;
      // 检查 KaTeX 块级公式 ($$)
      // 注意：这里简化检查，只要包含 $$ 就认为是块级结构候选，交给 parseBlocks 进一步确认
      if (content.includes("$$")) {
        return true;
      }
      // 检查代码块围栏 (```)
      if (content.trim().startsWith("```")) {
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
