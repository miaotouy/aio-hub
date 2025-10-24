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
 * 联合类型：所有支持的 AST 节点类型
 */
export type AstNode =
  // 内联节点
  | TextNode
  | StrongNode
  | EmNode
  | StrikethroughNode
  | InlineCodeNode
  | LinkNode
  // 块级节点
  | ParagraphNode
  | HeadingNode
  | CodeBlockNode
  | ListNode
  | ListItemNode
  | ImageNode
  | BlockquoteNode
  | HrNode
  | TableNode
  | TableRowNode
  | TableCellNode;

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
}

/**
 * 流数据源接口
 */
export interface StreamSource {
  subscribe: (callback: (chunk: string) => void) => () => void;
}

// ============ 配置管理相关类型 ============

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
}