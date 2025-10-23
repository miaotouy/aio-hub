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
 * 段落节点
 */
export interface ParagraphNode extends BaseAstNode {
  type: 'paragraph';
  props: {
    content: string;
  };
  children?: never;
}

/**
 * 标题节点
 */
export interface HeadingNode extends BaseAstNode {
  type: 'heading';
  props: {
    level: number;      // 1-6
    content: string;
  };
  children?: never;
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
 * 链接节点
 */
export interface LinkNode extends BaseAstNode {
  type: 'link';
  props: {
    href: string;
    title?: string;
    content: string;
  };
  children?: never;
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
 * 强调节点（粗体/斜体等）
 */
export interface EmphasisNode extends BaseAstNode {
  type: 'emphasis';
  props: {
    level: 1 | 2;       // 1=斜体, 2=粗体
    content: string;
  };
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
    content: string;
  };
  children?: never;
}

/**
 * 联合类型：所有支持的 AST 节点类型
 */
export type AstNode =
  | ParagraphNode
  | HeadingNode
  | CodeBlockNode
  | InlineCodeNode
  | ListNode
  | ListItemNode
  | LinkNode
  | ImageNode
  | BlockquoteNode
  | HrNode
  | EmphasisNode
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