import { Token, ParserContext } from "../types";
import { AstNode, GenericHtmlNode, LlmThinkNode } from "../../types";
import { decodeHtmlEntities } from "../utils/text-utils";
import { BLOCK_LEVEL_TAGS, hasBlockLevelStructure } from "../utils/block-utils";
import { parseInlineHtmlTag } from "../inline/parseHtmlInline";
import { tokensToRawText } from "../utils/text-utils";

// 需要保留空白符的标签
const PRE_FORMATTED_TAGS = new Set(["pre", "textarea", "code"]);

/**
 * 处理 HTML 内容的 tokens，移除多余的换行符并进行反转义
 * 用于在调用 parseInlines 之前预处理 tokens
 */
function normalizeHtmlTokens(tokens: Token[], tagName: string): Token[] {
  const isPreFormatted = PRE_FORMATTED_TAGS.has(tagName);

  // 预格式化标签特殊处理：仅移除首尾换行，保留中间内容原样
  if (isPreFormatted) {
    const result = tokens.map(t => t.type === 'text' ? { ...t, content: decodeHtmlEntities(t.content) } : t);

    // 移除开头的换行 (通常 HTML 会忽略 <pre> 后紧跟的第一个换行)
    if (result.length > 0 && result[0].type === "newline") {
      result.shift();
    }

    // 移除结尾的换行 (通常 HTML 会忽略 </pre> 前紧跟的最后一个换行)
    if (result.length > 0 && result[result.length - 1].type === "newline") {
      result.pop();
    }

    return result;
  }

  // 非预格式化标签：移除首尾换行，中间换行转空格
  const result: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // 将 newline token 转换为空格文本 token
    // 在 HTML 块上下文中，换行符通常应视为空格，而不是硬换行 <br>
    if (token.type === "newline") {
      // 如果是首尾的换行，直接忽略（HTML 忽略标签前后的空白）
      if (i === 0 || i === tokens.length - 1) {
        continue;
      }

      // 中间的换行转为空格
      result.push({
        type: "text",
        content: " "
      });
    } else {
      // 对普通文本进行反转义处理
      if (token.type === 'text') {
        result.push({
          ...token,
          content: decodeHtmlEntities(token.content)
        });
      } else {
        result.push(token);
      }
    }
  }

  return result;
}

/**
 * 解析 HTML 块（仅处理块级标签）
 */
export function parseHtmlBlock(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: GenericHtmlNode | null; nextIndex: number } {
  const openToken = tokens[start];
  if (openToken.type !== "html_open") {
    return { node: null, nextIndex: start + 1 };
  }

  const tagName = openToken.tagName;
  const attributes = openToken.attributes;
  const isSelfClosing = openToken.selfClosing;

  let i = start + 1;

  const htmlNode: GenericHtmlNode = {
    id: "",
    type: "generic_html",
    props: { tagName, attributes },
    children: [],
    meta: { range: { start: 0, end: 0 }, status: "stable" },
  };

  if (isSelfClosing) {
    return { node: htmlNode, nextIndex: i };
  }

  // 收集内部令牌
  const contentTokens: Token[] = [];
  let depth = 1;

  while (i < tokens.length && depth > 0) {
    const t = tokens[i];

    if (t.type === "html_open" && t.tagName === tagName && !t.selfClosing) {
      depth++;
      contentTokens.push(t);
    } else if (t.type === "html_close" && t.tagName === tagName) {
      depth--;
      if (depth === 0) {
        i++; // 跳过闭合标签
        break;
      }
      contentTokens.push(t);
    } else {
      contentTokens.push(t);
    }
    i++;
  }

  // 递归解析内部内容
  if (contentTokens.length > 0) {
    // 特例处理 <summary>：
    // 1. <summary> 必须作为块级标签被解析，以确保它能成为 <details> 的直接子节点。
    //    如果从 blockLevelTags 移除，它会被当作内联元素并错误地包裹在 <p> 中，
    //    破坏 <details> 结构，导致浏览器显示默认标题。
    // 2. 但其内部内容必须被当作内联元素处理，以防止在 <summary> 内部再生成 <p> 标签导致换行。
    //    因此，此处强制使用内联解析器 (parseInlines) 处理其子节点。
    //
    // 特例处理 <p> 和 标题：
    // <p> 和 标题标签内部不应该再包含块级元素（包括 <p>），否则会导致 HTML 结构错误。
    // 因此强制将其内容解析为内联元素。
    if (
      tagName === "summary" ||
      tagName === "p" ||
      /^h[1-6]$/.test(tagName)
    ) {
      // 预处理 tokens，处理换行符
      const normalizedTokens = normalizeHtmlTokens(contentTokens, tagName);
      htmlNode.children = ctx.parseInlines(normalizedTokens);
    } else {
      // 对于其他所有块级标签（如 <div>, <td>, <li> 等），
      // 使用 parseHtmlContent 进行混合内容解析。
      // 它能智能处理：
      // 1. 忽略标签间的空白（修复 Grid 布局问题）
      // 2. 对纯文本内容使用内联解析（避免不必要的 <p> 包裹，修复 li 内部 p 问题）
      // 3. 对包含 Markdown 块级语法的片段使用块级解析
      htmlNode.children = parseHtmlContent(ctx, contentTokens);
    }
  }

  return { node: htmlNode, nextIndex: i };
}

/**
 * 解析 HTML 块内的混合内容
 * 与 parseBlocks 不同,此方法:
 * 1. 不会将内联HTML标签包裹成段落
 * 2. 保持HTML原始结构
 */
export function parseHtmlContent(ctx: ParserContext, tokens: Token[]): AstNode[] {
  // 预处理所有文本 token 进行反转义
  const processedTokens = tokens.map(t => t.type === 'text' ? { ...t, content: decodeHtmlEntities(t.content) } : t);

  // 检查是否在 SVG 上下文中 (简单启发式：首个标签是 svg)
  const isSvgContext = processedTokens.some(t => t.type === 'html_open' && t.tagName === 'svg')
    || processedTokens.some(t => t.type === 'html_close' && t.tagName === 'svg');

  // 检查是否在表格上下文中 (避免在 <td> 内部产生不必要的段落)
  const isTableContext = processedTokens.some(t => t.type === 'html_open' && (t.tagName === 'td' || t.tagName === 'th'));

  const nodes: AstNode[] = [];
  let i = 0;

  while (i < processedTokens.length) {
    const token = processedTokens[i];

    // 跳过换行和纯空白
    if (token.type === "newline") {
      // 在 HTML 块级内容解析中，换行符通常应该被忽略，或者合并为空格
      // 这里我们选择跳过它，因为如果它后面跟着的是文本，
      // 文本部分会自带空格（如果有的话），或者在收集内联内容时会被处理。
      i++;
      continue;
    }

    if (token.type === "text" && /^\s+$/.test(token.content)) {
      // 更加激进地忽略块级标签内部的空白符
      // 1. 在 SVG 或 Table 上下文中，标签间的空白通常是格式化产生的
      // 2. 如果前后是块级标签，中间的纯空白通常也应该忽略，以避免干扰 Flex/Grid 布局
      const prev = nodes[nodes.length - 1];
      const next = processedTokens[i + 1];

      const isBetweenBlocks =
        (!prev || prev.type === 'generic_html' || prev.type === 'html_block') &&
        (!next || (next.type === 'html_open' && BLOCK_LEVEL_TAGS.has(next.tagName)) || next.type === 'html_close');

      if (isSvgContext || isTableContext || isBetweenBlocks) {
        i++;
        continue;
      }
    }

    // 跳过 HTML 注释
    if (token.type === "html_comment") {
      i++;
      continue;
    }

    // KaTeX 块级公式（应作为块级元素处理）
    if (token.type === "katex_block") {
      nodes.push({
        id: "",
        type: "katex_block",
        props: { content: token.content },
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      i++;
      continue;
    }

    // 代码块（应作为块级元素处理）
    if (token.type === "code_fence") {
      const language = token.language || "";
      const content = token.raw;
      const closed = token.closed ?? true;

      // 检查是否是 Mermaid 图表
      if (language.toLowerCase() === "mermaid" && closed) {
        nodes.push({
          id: "",
          type: "mermaid",
          props: { content },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
      } else {
        nodes.push({
          id: "",
          type: "code_block",
          props: { language, content, closed },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
      }
      i++;
      continue;
    }

    // 块级HTML标签 → 使用parseHtmlBlock
    if (token.type === "html_open" && BLOCK_LEVEL_TAGS.has(token.tagName)) {
      const { node, nextIndex } = parseHtmlBlock(ctx, processedTokens, i);
      if (node) nodes.push(node);
      i = nextIndex;
      continue;
    }

    // 内联HTML标签 → 直接处理,不包裹成段落
    if (token.type === "html_open") {
      const { node, nextIndex } = parseInlineHtmlTag(ctx, processedTokens, i);
      if (node) nodes.push(node);
      i = nextIndex;
      continue;
    }

    // 其他内联内容 → 收集后使用parseInlines
    const inlineTokens: Token[] = [];
    while (i < processedTokens.length) {
      const t = processedTokens[i];

      // 遇到块级HTML或换行,停止收集
      if (t.type === "html_open" && BLOCK_LEVEL_TAGS.has(t.tagName)) {
        break;
      }

      // 遇到显式的块级 token 也停止收集，交由主循环处理
      if (t.type === "katex_block" || t.type === "code_fence") {
        break;
      }

      if (t.type === "newline") {
        const next = processedTokens[i + 1];
        // 如果换行后紧跟块级标签或另一个换行，或者它是最后一个 token，则跳过并结束收集
        if (
          !next ||
          next.type === "newline" ||
          (next.type === "html_open" && BLOCK_LEVEL_TAGS.has(next.tagName)) ||
          next.type === "html_close"
        ) {
          i++;
          break;
        }

        // 暂时保留 newline token，以便后续 hasBlockLevelStructure 能够识别跨行块级结构（如表格）
        inlineTokens.push(t);
        i++;
        continue;
      }

      inlineTokens.push(t);
      i++;
    }

    if (inlineTokens.length > 0) {
      // 检查这些内联 tokens 是否包含块级结构（如列表、引用等）
      // 如果包含，使用 parseBlocks 解析以支持 Markdown 块级语法
      // 如果不包含，使用 parseInlines 解析以避免将普通文本包裹在 <p> 中
      if (hasBlockLevelStructure(inlineTokens)) {
        const blockNodes = ctx.parseBlocks(inlineTokens);
        nodes.push(...blockNodes);
      } else {
        // 如果没有块级结构，为了防止布局偏移（避免 parseInlines 将 newline 渲染为 <br>）
        // 我们在此将 newline token 统一转换为空格文本 token
        const sanitizedInlineTokens = inlineTokens.map(t =>
          t.type === "newline" ? { type: "text" as const, content: " " } : t
        );
        const inlineNodes = ctx.parseInlines(sanitizedInlineTokens);
        nodes.push(...inlineNodes);
      }
    }
  }

  return nodes;
}

/**
 * 解析 LLM 思考块
 */
export function parseLlmThinkBlock(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: LlmThinkNode | null; nextIndex: number } {
  const openToken = tokens[start];
  if (openToken.type !== "html_open") {
    return { node: null, nextIndex: start + 1 };
  }

  const tagName = openToken.tagName;
  const options = ctx.getOptions();

  // 查找对应的规则
  const rule = options.llmThinkRules.find((r) => r.tagName === tagName);
  const ruleId = rule?.id || `auto-${tagName}`;
  const displayName = rule?.displayName || tagName;
  const collapsedByDefault = rule?.collapsedByDefault ?? true;

  let i = start + 1;

  // 收集内部令牌，直到找到闭合标签
  const contentTokens: Token[] = [];
  let depth = 1;
  let isThinking = false; // 标记是否正在思考中（标签未闭合）

  while (i < tokens.length && depth > 0) {
    const t = tokens[i];

    if (t.type === "html_open" && t.tagName === tagName && !t.selfClosing) {
      depth++;
      contentTokens.push(t);
    } else if (t.type === "html_close" && t.tagName === tagName) {
      depth--;
      if (depth === 0) {
        i++; // 跳过闭合标签
        break;
      }
      contentTokens.push(t);
    } else {
      contentTokens.push(t);
    }
    i++;
  }

  // 如果遍历完所有令牌后 depth 仍大于 0，说明标签未闭合，正在思考中
  if (depth > 0) {
    isThinking = true;
  }

  // 移除开头的换行符（与代码围栏处理保持一致）
  if (contentTokens.length > 0 && contentTokens[0].type === "newline") {
    contentTokens.shift();
  }

  // 移除结尾的换行符
  while (contentTokens.length > 0 && contentTokens[contentTokens.length - 1].type === "newline") {
    contentTokens.pop();
  }

  // 将令牌转换为原始文本内容
  const rawContent = tokensToRawText(contentTokens);

  // 将内容解析为块级节点
  const children = contentTokens.length > 0 ? ctx.parseBlocks(contentTokens) : [];

  const llmThinkNode: LlmThinkNode = {
    id: "",
    type: "llm_think",
    props: {
      rawTagName: tagName,
      ruleId,
      displayName,
      collapsedByDefault,
      rawContent,
      isThinking, // 添加思考中状态
    },
    children,
    meta: { range: { start: 0, end: 0 }, status: "stable" },
  };

  return { node: llmThinkNode, nextIndex: i };
}
