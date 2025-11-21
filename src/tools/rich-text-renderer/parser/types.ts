import type { AstNode, LlmThinkRule } from "../types";

// ============ 令牌定义 ============

export type Token =
  | { type: "text"; content: string }
  | { type: "newline"; count: number }
  | {
    type: "html_open";
    tagName: string;
    attributes: Record<string, string>;
    selfClosing: boolean;
    raw: string;
  }
  | { type: "html_close"; tagName: string; raw: string }
  | { type: "strong_delimiter"; marker: "**" | "__"; raw: string }
  | { type: "em_delimiter"; marker: "*" | "_"; raw: string }
  | { type: "inline_code"; content: string }
  | { type: "strikethrough_delimiter"; marker: "~~"; raw: string }
  | { type: "quote_delimiter"; marker: "“" | "”" | "\""; raw: string }
  | { type: "image_marker"; raw: string }
  | { type: "link_text_open"; raw: string }
  | { type: "link_text_close"; raw: string }
  | { type: "link_url_open"; raw: string }
  | { type: "link_url_close"; raw: string }
  | { type: "heading_marker"; level: number; raw: string }
  | { type: "blockquote_marker"; raw: string }
  | { type: "list_marker"; ordered: boolean; raw: string; indent: number }
  | { type: "hr_marker"; raw: string }
  | { type: "code_fence"; language: string; raw: string }
  | { type: "katex_block"; content: string }
  | { type: "katex_inline"; content: string }
  | { type: "autolink"; url: string; raw: string };

// ============ 解析器上下文 ============

export interface ParserOptions {
  llmThinkTagNames: Set<string>;
  llmThinkRules: LlmThinkRule[];
}

export interface ParserContext {
  parseBlocks(tokens: Token[]): AstNode[];
  parseInlines(tokens: Token[]): AstNode[];
  getOptions(): ParserOptions;
}
