// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

import type { AstNode, LlmThinkRule } from "../types";
import { isEqual } from "lodash-es";
import { Tokenizer } from "../parser/Tokenizer";
import { tokenizerService } from "../parser/tokenizerService";
import { Token, ParserContext, ParserOptions } from "../parser/types";
import {
  optimizeBadgeLineBreaks,
  computeFingerprint,
} from "../parser/utils/text-utils";
import { isTableStart, BLOCK_LEVEL_TAGS } from "../parser/utils/block-utils";

// 导入解析器
import { parseCodeBlock } from "../parser/block/parseCodeBlock";
import { parseHeading } from "../parser/block/parseHeading";
import { parseBlockquote } from "../parser/block/parseBlockquote";
import { parseList } from "../parser/block/parseList";
import { parseTable } from "../parser/block/parseTable";
import { parseHtmlBlock, parseLlmThinkBlock } from "../parser/block/parseHtml";
import { parseParagraph } from "../parser/block/parseParagraph";
import { parseVcpRole } from "../parser/block/parseVcpRole";
import { parseVcpDailyNote } from "../parser/block/parseVcpDailyNote";
import { parseInlines } from "../parser/inline/parseInlines";
import { normalizeReference } from "../parser/utils/markdown-reference";

interface ParsedBlock {
  node: AstNode | null;
  nextIndex: number;
}

interface PendingBlock {
  from: number;
  to: number;
  readTo: number;
  node: AstNode;
}

// ============ 解析器 ============

export class CustomParser implements ParserContext {
  private llmThinkTagNames: Set<string>;
  private llmThinkRules: LlmThinkRule[];
  private defaultToolCallCollapsed: boolean;
  private vcpFuzzyModeEnabled: boolean;
  private references = new Map<string, { href: string; title: string }>();
  private parseEpoch = 0;
  private pendingCache: {
    tokens: Token[];
    blocks: PendingBlock[];
    context: string;
  } | null = null;

  constructor(
    llmThinkTagNames: Set<string> = new Set(["think"]),
    llmThinkRules: LlmThinkRule[] = [],
    defaultToolCallCollapsed: boolean = false,
    vcpFuzzyModeEnabled: boolean = true
  ) {
    this.llmThinkTagNames = llmThinkTagNames;
    this.llmThinkRules = llmThinkRules;
    this.defaultToolCallCollapsed = defaultToolCallCollapsed;
    this.vcpFuzzyModeEnabled = vcpFuzzyModeEnabled;
  }

  public getOptions(): ParserOptions {
    return {
      llmThinkTagNames: this.llmThinkTagNames,
      llmThinkRules: this.llmThinkRules,
      vcpFuzzyModeEnabled: this.vcpFuzzyModeEnabled,
    };
  }

  /**
   * 解析完整的 Markdown 文本 (同步版本)
   */
  public parse(text: string): AstNode[] {
    this.reset();
    if (!text) return [];

    const tokenizer = new Tokenizer({
      vcpFuzzyModeEnabled: this.vcpFuzzyModeEnabled,
    });
    const tokens = tokenizer.tokenize(text);

    this.collectReferences(tokens);
    const blocks = this.parseBlocks(tokens);

    // 优化徽章之间的换行
    return optimizeBadgeLineBreaks(blocks);
  }

  /**
   * 解析完整的 Markdown 文本 (异步版本，使用 Worker 分词)
   */
  public async parseAsync(text: string): Promise<AstNode[]> {
    this.reset();
    if (!text) return [];

    const tokens = await tokenizerService.tokenize(text, {
      vcpFuzzyModeEnabled: this.vcpFuzzyModeEnabled,
    });

    this.references.clear();
    this.collectReferences(tokens);
    const blocks = this.parseBlocks(tokens);

    // 优化徽章之间的换行
    return optimizeBadgeLineBreaks(blocks);
  }

  /** Complete pending AST, reusing only blocks whose full token dependencies still match. */
  public async parsePendingAsync(text: string): Promise<AstNode[]> {
    const epoch = ++this.parseEpoch;
    const previous = this.pendingCache;
    if (!text) {
      tokenizerService.release(this);
      this.pendingCache = null;
      this.references.clear();
      return [];
    }
    const tokens = await tokenizerService.tokenize(
      text,
      { vcpFuzzyModeEnabled: this.vcpFuzzyModeEnabled },
      this
    );
    this.references.clear();
    this.collectReferences(tokens);
    const context = JSON.stringify([
      [...this.references],
      [...this.llmThinkTagNames],
      this.llmThinkRules,
      this.defaultToolCallCollapsed,
      this.vcpFuzzyModeEnabled,
    ]);
    let common = 0;
    const cache =
      epoch === this.parseEpoch && previous?.context === context
        ? previous
        : null;
    if (cache) {
      const length = Math.min(cache.tokens.length, tokens.length);
      while (common < length && isEqual(cache.tokens[common], tokens[common]))
        common++;
    }
    const reused: PendingBlock[] = [];
    if (cache) {
      for (const block of cache.blocks) {
        if (block.readTo > common) break;
        reused.push(block);
      }
    }
    // Include skipped tokens between roots so edits to comments/whitespace can become new blocks.
    const from = reused.length ? reused[reused.length - 1].to : 0;
    const tailBlocks: PendingBlock[] = [];
    const tail = optimizeBadgeLineBreaks(
      this.parseBlockRange(tokens, from, tailBlocks)
    );
    for (let index = 0; index < tail.length; index++)
      tailBlocks[index].node = tail[index];
    const blocks = [...reused, ...tailBlocks];
    // Reset/destroy or a newer parse owns the cache after an asynchronous tokenization.
    if (epoch === this.parseEpoch)
      this.pendingCache = { tokens, blocks, context };
    return blocks.map((block) => block.node);
  }

  private collectReferences(tokens: Token[]): void {
    for (const token of tokens) {
      if (
        token.type === "reference_definition" &&
        !this.references.has(token.label)
      ) {
        this.references.set(token.label, {
          href: token.href,
          title: token.title,
        });
      }
    }
  }

  public getReference(label: string) {
    return this.references.get(normalizeReference(label));
  }

  /**
   * 块级解析
   */
  public parseBlocks(tokens: Token[]): AstNode[] {
    return this.parseBlockRange(tokens, 0);
  }

  private parseBlockRange(
    tokens: Token[],
    from: number,
    spans?: PendingBlock[]
  ): AstNode[] {
    const blocks: AstNode[] = [];
    let index = from;
    while (index < tokens.length) {
      let readTo = 0;
      const { node, nextIndex } = this.parseBlock(
        tokens,
        index,
        spans
          ? (end) => {
              readTo = Math.max(readTo, end);
            }
          : undefined
      );
      if (node) {
        blocks.push(node);
        spans?.push({
          from: index,
          to: nextIndex,
          readTo: Math.max(nextIndex + 1, readTo),
          node,
        });
      }
      index = nextIndex;
    }
    return blocks;
  }

  private parseBlock(
    tokens: Token[],
    start: number,
    onLookahead?: (end: number) => void
  ): ParsedBlock {
    const token = tokens[start];
    if (
      token.type === "newline" ||
      token.type === "reference_definition" ||
      token.type === "html_comment"
    ) {
      return { node: null, nextIndex: start + 1 };
    }
    if (token.type === "code_fence") return parseCodeBlock(tokens, start);
    if (token.type === "katex_block") {
      return {
        node: {
          id: "",
          type: "katex_block",
          props: { content: token.content },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
          _fp: computeFingerprint(token.content),
        },
        nextIndex: start + 1,
      };
    }
    if (token.type === "heading_marker")
      return parseHeading(this, tokens, start);
    if (token.type === "blockquote_marker")
      return parseBlockquote(this, tokens, start);
    if (token.type === "list_marker") return parseList(this, tokens, start);
    if (isTableStart(tokens, start, onLookahead))
      return parseTable(this, tokens, start);
    if (
      token.type === "html_open" &&
      this.llmThinkTagNames.has(token.tagName)
    ) {
      return parseLlmThinkBlock(this, tokens, start);
    }
    if (token.type === "html_open" && BLOCK_LEVEL_TAGS.has(token.tagName)) {
      return parseHtmlBlock(this, tokens, start);
    }
    if (token.type === "hr_marker") {
      return {
        node: {
          id: "",
          type: "hr",
          props: {},
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        },
        nextIndex: start + 1,
      };
    }
    if (token.type === "vcp_role") return parseVcpRole(this, tokens, start);
    if (token.type === "vcp_daily_note")
      return parseVcpDailyNote(this, tokens, start);
    if (token.type === "vcp_tool") {
      return {
        node: {
          id: "",
          type: "vcp_tool",
          props: {
            raw: token.raw,
            closed: token.closed,
            tool_name: token.tool_name,
            command: token.command,
            maid: token.maid,
            args: token.args,
            isResult: token.isResult,
            status: token.status,
            resultContent: token.resultContent,
            fenceError: token.fenceError,
            collapsedByDefault: this.defaultToolCallCollapsed,
          },
          meta: {
            range: { start: 0, end: 0 },
            status: token.closed ? "stable" : "pending",
          },
          _fp: computeFingerprint(token.raw),
        },
        nextIndex: start + 1,
      };
    }
    return parseParagraph(this, tokens, start);
  }

  /**
   * 内联解析
   */
  public parseInlines(tokens: Token[]): AstNode[] {
    return parseInlines(this, tokens);
  }

  public reset(): void {
    tokenizerService.release(this);
    this.parseEpoch++;
    this.pendingCache = null;
    this.references.clear();
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
