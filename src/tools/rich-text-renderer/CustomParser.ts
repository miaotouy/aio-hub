/**
 * 自定义 Markdown 解析器 (V2架构)
 *
 * 核心职责：将完整的 Markdown 文本解析为 AST
 *
 * 设计原则：
 * 1. 不处理流式逻辑（由 StreamProcessorV2 处理）
 * 2. 输入：完整的 Markdown 文本
 * 3. 输出：完整的 AST
 * 4. 两级解析：块级 → 内联
 */

import type {
  AstNode,
  LlmThinkRule,
} from "./types";
import { Tokenizer } from "./parser/Tokenizer";
import { Token, ParserContext, ParserOptions } from "./parser/types";
import { optimizeBadgeLineBreaks } from "./parser/utils/text-utils";
import { isTableStart, BLOCK_LEVEL_TAGS } from "./parser/utils/block-utils";

// 导入解析器
import { parseCodeBlock } from "./parser/block/parseCodeBlock";
import { parseHeading } from "./parser/block/parseHeading";
import { parseBlockquote } from "./parser/block/parseBlockquote";
import { parseList } from "./parser/block/parseList";
import { parseTable } from "./parser/block/parseTable";
import { parseHtmlBlock, parseLlmThinkBlock } from "./parser/block/parseHtml";
import { parseParagraph } from "./parser/block/parseParagraph";
import { parseInlines } from "./parser/inline/parseInlines";

// ============ 解析器 ============

export class CustomParser implements ParserContext {
  private llmThinkTagNames: Set<string>;
  private llmThinkRules: LlmThinkRule[];

  constructor(
    llmThinkTagNames: Set<string> = new Set(["think"]),
    llmThinkRules: LlmThinkRule[] = []
  ) {
    this.llmThinkTagNames = llmThinkTagNames;
    this.llmThinkRules = llmThinkRules;
  }

  public getOptions(): ParserOptions {
    return {
      llmThinkTagNames: this.llmThinkTagNames,
      llmThinkRules: this.llmThinkRules,
    };
  }

  /**
   * 解析完整的 Markdown 文本
   */
  public parse(text: string): AstNode[] {
    if (!text) return [];

    const tokenizer = new Tokenizer();
    const tokens = tokenizer.tokenize(text);

    const blocks = this.parseBlocks(tokens);

    // 优化徽章之间的换行
    return optimizeBadgeLineBreaks(blocks);
  }

  /**
   * 块级解析
   */
  public parseBlocks(tokens: Token[]): AstNode[] {
    const blocks: AstNode[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      // 跳过换行
      if (token.type === "newline") {
        i++;
        continue;
      }

      // 跳过 HTML 注释
      if (token.type === "html_comment") {
        i++;
        continue;
      }

      // 代码块
      if (token.type === "code_fence") {
        const { node, nextIndex } = parseCodeBlock(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // KaTeX 块级公式
      if (token.type === "katex_block") {
        blocks.push({
          id: "",
          type: "katex_block",
          props: { content: token.content },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        i++;
        continue;
      }

      // 标题
      if (token.type === "heading_marker") {
        const { node, nextIndex } = parseHeading(this, tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 引用块
      if (token.type === "blockquote_marker") {
        const { node, nextIndex } = parseBlockquote(this, tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 列表
      if (token.type === "list_marker") {
        const { node, nextIndex } = parseList(this, tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 表格（检测表格起始）
      if (isTableStart(tokens, i)) {
        const { node, nextIndex } = parseTable(this, tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // LLM 思考块（优先处理，在 HTML 块之前）
      if (token.type === "html_open" && this.llmThinkTagNames.has(token.tagName)) {
        const { node, nextIndex } = parseLlmThinkBlock(this, tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // HTML 块（只处理块级标签）
      if (token.type === "html_open") {
        const isBlockLevel = BLOCK_LEVEL_TAGS.has(token.tagName);

        if (isBlockLevel) {
          const { node, nextIndex } = parseHtmlBlock(this, tokens, i);
          if (node) blocks.push(node);
          i = nextIndex;
          continue;
        }
        // 内联标签,交给段落处理
      }

      // 水平线
      if (token.type === "hr_marker") {
        blocks.push({
          id: "",
          type: "hr",
          props: {},
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
        i++;
        continue;
      }

      // 段落（默认）
      const { node, nextIndex } = parseParagraph(this, tokens, i);
      if (node) blocks.push(node);
      i = nextIndex;
    }

    return blocks;
  }

  /**
   * 内联解析
   */
  public parseInlines(tokens: Token[]): AstNode[] {
    return parseInlines(this, tokens);
  }

  public reset(): void {
    // 不再需要重置计数器
  }
}

// ============ 导出工具函数 ============

export function parseText(
  text: string,
  llmThinkTagNames?: Set<string>,
  llmThinkRules?: LlmThinkRule[]
): AstNode[] {
  const parser = new CustomParser(llmThinkTagNames, llmThinkRules);
  return parser.parse(text);
}
