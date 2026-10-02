/**
 * 移动端富文本渲染器类型定义
 * 复用并按需裁剪 @shared/tools/rich-text-renderer/types 的纯 TypeScript AST 定义
 */

export type {
  AstNode,
  BaseAstNode,
  NodeMeta,
  TextNode,
  StrongNode,
  EmNode,
  StrikethroughNode,
  QuoteNode,
  ParagraphNode,
  HeadingNode,
  CodeBlockNode,
  MermaidNode,
  LlmThinkNode,
  InlineCodeNode,
  ListNode,
  ListItemNode,
  LinkNode,
  ImageNode,
  BlockquoteNode,
  AlertNode,
  HrNode,
  HtmlBlockNode,
  HtmlInlineNode,
  GenericHtmlNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  KatexInlineNode,
  KatexBlockNode,
  VcpToolNode,
  VcpRoleNode,
  VcpDailyNoteNode,
  Patch,
  NodeMap,
  StreamProcessorOptions,
  LlmThinkRule,
  StreamSource,
} from "@shared/tools/rich-text-renderer/types";

import type { MediaItem } from "@/components/media/types";

/** 移动端富文本渲染上下文（通过 provide / inject 跨 AST 层级共享） */
export interface MobileRichTextContext {
  resolveAsset?: (content: string) => string;
  resolveMediaItem?: (source: string) => MediaItem | null;
  isStreaming?: boolean;
  disableThinkParsing?: boolean;
  disableVcpParsing?: boolean;
}

export const MOBILE_RICH_TEXT_CONTEXT_KEY = Symbol("MOBILE_RICH_TEXT_CONTEXT");
