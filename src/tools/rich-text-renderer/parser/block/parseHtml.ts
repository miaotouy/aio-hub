import { Token, ParserContext } from "../types";
import { AstNode, GenericHtmlNode, LlmThinkNode } from "../../types";
import { BLOCK_LEVEL_TAGS, hasBlockLevelStructure } from "../utils/block-utils";
import { parseInlineHtmlTag } from "../inline/parseHtmlInline";
import { tokensToRawText } from "../utils/text-utils";

// 需要保留空白符的标签
const PRE_FORMATTED_TAGS = new Set(["pre", "textarea", "code"]);

/**
 * 处理 HTML 内容的 tokens，移除多余的换行符
 * 用于在调用 parseInlines 之前预处理 tokens
 */
function normalizeHtmlTokens(tokens: Token[], tagName: string): Token[] {
  const isPreFormatted = PRE_FORMATTED_TAGS.has(tagName);

  // 预格式化标签特殊处理：仅移除首尾换行，保留中间内容原样
  if (isPreFormatted) {
    const result = [...tokens];
    
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
      result.push(token);
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
      // 检测是否只包含内联内容（没有块级结构）
      // 如果内容中没有双换行、没有块级标记，则视为纯内联内容
      const hasBlockStructure = hasBlockLevelStructure(contentTokens);

      if (!hasBlockStructure) {
        // 纯内联内容，直接使用内联解析，避免被包裹成段落
        // 预处理 tokens，处理换行符
        const normalizedTokens = normalizeHtmlTokens(contentTokens, tagName);
        htmlNode.children = ctx.parseInlines(normalizedTokens);
      } else {
        // 包含块级结构，使用HTML内容专用解析(不包裹内联HTML为段落)
        htmlNode.children = parseHtmlContent(ctx, contentTokens);
      }
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
  const nodes: AstNode[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // 跳过换行和纯空白
    if (token.type === "newline") {
      i++;
      continue;
    }

    if (token.type === "text" && /^\s+$/.test(token.content)) {
      i++;
      continue;
    }

    // 跳过 HTML 注释
    if (token.type === "html_comment") {
      i++;
      continue;
    }

    // 块级HTML标签 → 使用parseHtmlBlock
    if (token.type === "html_open" && BLOCK_LEVEL_TAGS.has(token.tagName)) {
      const { node, nextIndex } = parseHtmlBlock(ctx, tokens, i);
      if (node) nodes.push(node);
      i = nextIndex;
      continue;
    }

    // 内联HTML标签 → 直接处理,不包裹成段落
    if (token.type === "html_open") {
      const { node, nextIndex } = parseInlineHtmlTag(ctx, tokens, i);
      if (node) nodes.push(node);
      i = nextIndex;
      continue;
    }

    // 其他内联内容 → 收集后使用parseInlines
    const inlineTokens: Token[] = [];
    while (i < tokens.length) {
      const t = tokens[i];

      // 遇到块级HTML或换行,停止收集
      if (t.type === "html_open" && BLOCK_LEVEL_TAGS.has(t.tagName)) {
        break;
      }
      if (t.type === "newline" && i + 1 < tokens.length) {
        const next = tokens[i + 1];
        if (
          next.type === "newline" ||
          (next.type === "html_open" && BLOCK_LEVEL_TAGS.has(next.tagName))
        ) {
          i++; // 跳过这个换行
          break;
        }
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
        const inlineNodes = ctx.parseInlines(inlineTokens);
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
