/**
 * 富文本渲染引擎 - 核心类型定义
 * 
 * 基于架构文档的设计，实现 AST 节点和 Patch 指令系统
 */

// ============ AST 节点相关类型 ============

/**
 * 节点元数据
 * range 仅用于调试和窗口计算，不参与寻址
 */
export interface NodeMeta {
  range: { start: number; end: number };
  status?: 'stable' | 'pending';
}

/**
 * 基础 AST 节点接口
 */
export interface BaseAstNode {
  id: string;              // 稳定ID，使用单调计数器生成
  type: string;            // 节点类型标识
  children?: AstNode[];    // 子节点
  meta: NodeMeta;          // 元数据
}

/**
 * 纯文本节点（内联）
 */
export interface TextNode extends BaseAstNode {
  type: 'text';
  props: {
    content: string;
  };
  children?: never;
}

/**
 * 粗体节点（内联）
 */
export interface StrongNode extends BaseAstNode {
  type: 'strong';
  props: Record<string, never>;
  children: AstNode[];
}

/**
 * 斜体节点（内联）
 */
export interface EmNode extends BaseAstNode {
  type: 'em';
  props: Record<string, never>;
  children: AstNode[];
}

/**
 * 删除线节点（内联）
 */
export interface StrikethroughNode extends BaseAstNode {
  type: 'strikethrough';
  props: Record<string, never>;
  children: AstNode[];
}

/**
 * 引号节点（内联）
 * 用于包裹被引号括起来的内容，如 "Hello" 或 “你好”
 */
export interface QuoteNode extends BaseAstNode {
  type: 'quote';
  props: {
    startMarker: string;
    endMarker: string;
  };
  children: AstNode[];
}

/**
 * 段落节点
 */
export interface ParagraphNode extends BaseAstNode {
  type: 'paragraph';
  props: Record<string, never>;
  children: AstNode[];  // 包含内联元素
}

/**
 * 标题节点
 */
export interface HeadingNode extends BaseAstNode {
  type: 'heading';
  props: {
    level: number;      // 1-6
  };
  children: AstNode[];  // 包含内联元素
}

/**
 * 代码块节点
 */
export interface CodeBlockNode extends BaseAstNode {
  type: 'code_block';
  props: {
    language?: string;
    content: string;
  };
  children?: never;
}

/**
 * Mermaid 图表节点
 */
export interface MermaidNode extends BaseAstNode {
  type: 'mermaid';
  props: {
    content: string;
  };
  children?: never;
}

/**
 * LLM 思考节点（块级）
 * 用于包裹 LLM 的 Chain of Thought（CoT）推理过程
 */
export interface LlmThinkNode extends BaseAstNode {
  type: 'llm_think';
  props: {
    rawTagName: string;        // 原始标签名，如 'think', 'guguthink'
    ruleId: string;             // 命中的规则标识
    displayName: string;        // 用于 UI 显示的名称
    collapsedByDefault: boolean; // 是否默认折叠
    rawContent?: string;        // 原始文本内容，用于查看未渲染的内容
    isThinking?: boolean;       // 是否正在思考中（用于显示动画效果）
  };
  children: AstNode[];          // 内部可以包含任何 AST 节点
}

/**
 * 行内代码节点
 */
export interface InlineCodeNode extends BaseAstNode {
  type: 'inline_code';
  props: {
    content: string;
  };
  children?: never;
}

/**
 * 列表节点
 */
export interface ListNode extends BaseAstNode {
  type: 'list';
  props: {
    ordered: boolean;    // 是否为有序列表
    start?: number;      // 起始序号（有序列表）
  };
  children: AstNode[];   // 列表项
}

/**
 * 列表项节点
 */
export interface ListItemNode extends BaseAstNode {
  type: 'list_item';
  props: Record<string, never>;
  children: AstNode[];
}

/**
 * 链接节点（内联）
 */
export interface LinkNode extends BaseAstNode {
  type: 'link';
  props: {
    href: string;
    title?: string;
  };
  children: AstNode[];  // 链接文本
}

/**
 * 图片节点
 */
export interface ImageNode extends BaseAstNode {
  type: 'image';
  props: {
    src: string;
    alt?: string;
    title?: string;
  };
  children?: never;
}

/**
 * 引用块节点
 */
export interface BlockquoteNode extends BaseAstNode {
  type: 'blockquote';
  props: Record<string, never>;
  children: AstNode[];
}

/**
 * 水平线节点
 */
export interface HrNode extends BaseAstNode {
  type: 'hr';
  props: Record<string, never>;
  children?: never;
}

/**
 * 硬换行节点 (GFM style)
 */
export interface HardBreakNode extends BaseAstNode {
  type: 'hard_break';
  props: Record<string, never>;
  children?: never;
}

/**
 * HTML 块级节点
 * 用于渲染 HTML 块级标签（如 <div>, <p>, <section> 等）
 */
export interface HtmlBlockNode extends BaseAstNode {
  type: 'html_block';
  props: {
    content: string;  // 原始 HTML 内容
  };
  children?: never;
}

/**
 * HTML 内联节点
 * 用于渲染 HTML 内联标签（如 <span>, <b>, <i> 等）
 */
export interface HtmlInlineNode extends BaseAstNode {
  type: 'html_inline';
  props: {
    content: string;  // 原始 HTML 内容
  };
  children?: never;
}
/**
 * 通用 HTML 节点
 * 用于解析和表示结构化的 HTML 标签，内部可包含混合内容
 */
export interface GenericHtmlNode extends BaseAstNode {
  type: 'generic_html';
  props: {
    tagName: string;              // e.g., 'div', 'p', 'span'
    attributes: Record<string, string>; // e.g., { style: '...', class: '...' }
  };
  children: AstNode[]; // 内部可以包含任何其他 AST 节点！
}

/**
 * 表格节点
 */
export interface TableNode extends BaseAstNode {
  type: 'table';
  props: {
    align?: ('left' | 'center' | 'right')[];
  };
  children: AstNode[];  // thead 和 tbody
}

/**
 * 表格行节点
 */
export interface TableRowNode extends BaseAstNode {
  type: 'table_row';
  props: {
    isHeader?: boolean;
  };
  children: AstNode[];  // td 或 th
}

/**
 * 表格单元格节点
 */
export interface TableCellNode extends BaseAstNode {
  type: 'table_cell';
  props: {
    align?: 'left' | 'center' | 'right';
    isHeader?: boolean;
  };
  children: AstNode[];  // 包含内联元素
}

/**
 * KaTeX 行内公式节点
 * 用于渲染行内数学公式，语法：$...$
 */
export interface KatexInlineNode extends BaseAstNode {
  type: 'katex_inline';
  props: {
    content: string;  // LaTeX 公式内容
  };
  children?: never;
}

/**
 * KaTeX 块级公式节点
 * 用于渲染块级数学公式，语法：$$...$$
 */
export interface KatexBlockNode extends BaseAstNode {
  type: 'katex_block';
  props: {
    content: string;  // LaTeX 公式内容
  };
  children?: never;
}

/**
 * 联合类型:所有支持的 AST 节点类型
 */
export type AstNode =
  // 内联节点
  | TextNode
  | StrongNode
  | EmNode
  | StrikethroughNode
  | QuoteNode
  | InlineCodeNode
  | LinkNode
  | HtmlInlineNode
  | HardBreakNode
  | GenericHtmlNode // V2 架构新增
  | KatexInlineNode // KaTeX 行内公式

  // 块级节点
  | ParagraphNode
  | HeadingNode
  | CodeBlockNode
  | MermaidNode
  | LlmThinkNode    // LLM 思考节点
  | ListNode
  | ListItemNode
  | ImageNode
  | BlockquoteNode
  | HrNode
  | HtmlBlockNode
  | TableNode
  | TableRowNode
  | TableCellNode
  | KatexBlockNode; // KaTeX 块级公式
// ============ Patch 指令相关类型 ============

/**
 * 文本追加指令
 */
export interface TextAppendPatch {
  op: 'text-append';
  id: string;
  text: string;
}

/**
 * 属性设置指令
 */
export interface SetPropPatch {
  op: 'set-prop';
  id: string;
  key: string;
  value: unknown;
}

/**
 * 节点替换指令
 */
export interface ReplaceNodePatch {
  op: 'replace-node';
  id: string;
  newNode: AstNode;
}

/**
 * 在指定节点之后插入
 */
export interface InsertAfterPatch {
  op: 'insert-after';
  id: string;
  newNode: AstNode;
}

/**
 * 在指定节点之前插入
 */
export interface InsertBeforePatch {
  op: 'insert-before';
  id: string;
  newNode: AstNode;
}

/**
 * 删除节点指令
 */
export interface RemoveNodePatch {
  op: 'remove-node';
  id: string;
}

/**
 * 替换子节点范围
 */
export interface ReplaceChildrenRangePatch {
  op: 'replace-children-range';
  parentId: string;
  start: number;
  deleteCount: number;
  newChildren: AstNode[];
}

/**
 * 替换根节点
 */
export interface ReplaceRootPatch {
  op: 'replace-root';
  newRoot: AstNode[];
}

/**
 * 联合类型：所有 Patch 指令
 */
export type Patch =
  | TextAppendPatch
  | SetPropPatch
  | ReplaceNodePatch
  | InsertAfterPatch
  | InsertBeforePatch
  | RemoveNodePatch
  | ReplaceChildrenRangePatch
  | ReplaceRootPatch;

// ============ 节点索引相关类型 ============

/**
 * 节点索引信息
 */
export interface NodeIndex {
  node: AstNode;
  parentId?: string;
}

/**
 * 节点映射表类型
 */
export type NodeMap = Map<string, NodeIndex>;

// ============ 流式处理相关类型 ============

/**
 * StreamProcessor 配置选项
 */
export interface StreamProcessorOptions {
  onPatch: (patches: Patch[]) => void;
  /** LLM 思考标签名集合（仅 V2 使用） */
  llmThinkTagNames?: Set<string>;
  /** LLM 思考规则配置（仅 V2 使用） */
  llmThinkRules?: LlmThinkRule[];
}

/**
 * 流数据源接口
 */
export interface StreamSource {
  subscribe: (callback: (chunk: string) => void) => () => void;
  onComplete?: (callback: () => void) => () => void;
}

// ============ LLM 思考节点配置 ============

/**
 * LLM 思考标签规则
 * 用于配置哪些 XML 标签应该被识别为"思考节点"
 */
export interface LlmThinkRule {
  /** 规则唯一标识，如 'anthropic-cot', 'gugu-think' */
  id: string;
  /** 规则类型，目前只支持 'xml_tag' */
  kind: 'xml_tag';
  /** XML 标签名，如 'thinking', 'guguthink' */
  tagName: string;
  /** 用于 UI 显示的名称，如 "Claude 思考过程" */
  displayName: string;
  /** 是否默认折叠，默认 true */
  collapsedByDefault?: boolean;
}

// ============ 配置管理相关类型 ============

/**
 * 渲染器版本枚举
 *
 * 各版本的详细描述和元数据请参考 store.ts 中的 availableVersions
 */
export enum RendererVersion {
  V1_MARKDOWN_IT = 'v1-markdown-it',
  V2_CUSTOM_PARSER = 'v2-custom-parser',
  PURE_MARKDOWN_IT = 'pure-markdown-it',
  HYBRID_V3 = 'hybrid-v3',
}

/**
 * 渲染器版本元数据
 */
export interface RendererVersionMeta {
  /** 版本标识 */
  version: RendererVersion;
  /** 显示名称 */
  name: string;
  /** 描述信息 */
  description: string;
  /** 是否可用 */
  enabled: boolean;
  /** 特性标签 */
  tags?: string[];
}

/**
 * 测试页面配置
 */
export interface TesterConfig {
  /** 配置版本号 */
  version: string;
  /** 输入栏是否折叠 */
  isInputCollapsed: boolean;
  /** 当前选中的预设 ID */
  selectedPreset: string;
  /** 流式输出是否启用 */
  streamEnabled: boolean;
  /** 流式输出速度（字符/秒） */
  streamSpeed: number;
  /** 初始延迟（毫秒） */
  initialDelay: number;
  /** 波动模式是否启用 */
  fluctuationEnabled: boolean;
  /** 延迟波动范围 */
  delayFluctuation: {
    min: number;
    max: number;
  };
  /** 字符数波动范围 */
  charsFluctuation: {
    min: number;
    max: number;
  };
  /** 输入内容 */
  inputContent: string;
  /** 是否自动滚动到底部 */
  autoScroll: boolean;
  /** 是否可视化块状态 */
  visualizeBlockStatus: boolean;
  /** 当前使用的渲染器版本 */
  rendererVersion: RendererVersion;
  /** LLM 思考块规则配置 */
  llmThinkRules: LlmThinkRule[];
  /** 富文本样式配置 */
  richTextStyleOptions: RichTextRendererStyleOptions;
}

// ============ 样式配置相关类型 ============

/**
 * Markdown 元素样式配置项
 * 用于生成 CSS 变量，支持颜色、发光等效果
 */
export interface MarkdownStyleOption {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textDecoration?: string;
  textShadow?: string; // 用于发光效果
  boxShadow?: string;  // 用于发光效果
  borderRadius?: string;
}

/**
 * 富文本渲染器样式配置
 */
export interface RichTextRendererStyleOptions {
  paragraph?: MarkdownStyleOption;
  strong?: MarkdownStyleOption;
  em?: MarkdownStyleOption;
  strikethrough?: MarkdownStyleOption;
  quote?: MarkdownStyleOption;
  blockquote?: MarkdownStyleOption;
  inlineCode?: MarkdownStyleOption;
  link?: MarkdownStyleOption;
  // 标题样式
  h1?: MarkdownStyleOption;
  h2?: MarkdownStyleOption;
  h3?: MarkdownStyleOption;
  h4?: MarkdownStyleOption;
  h5?: MarkdownStyleOption;
  h6?: MarkdownStyleOption;
}