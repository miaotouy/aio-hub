/**
 * 变量操作符定义
 */
export type VariableOperator = "=" | "+" | "-" | "*" | "/" | "set" | "add" | "sub";

/**
 * 变量树节点
 * 支持嵌套分组或具体的变量定义
 */
export interface VariableTreeNode {
  /** 键名（在当前层级的名称，如 "hp"） */
  key: string;
  /** 类型：分组或变量 */
  type: "group" | "variable";
  /** 显示名称 */
  displayName?: string;
  /** 描述 */
  description?: string;
  /** 子节点（仅 type 为 group 时有效） */
  children?: VariableTreeNode[];
  /** 初始值（仅 type 为 variable 时有效） */
  initialValue?: any;
  /** 最小值约束（可选） */
  min?: number;
  /** 最大值约束（可选） */
  max?: number;
  /** 是否在 UI 中隐藏 */
  hidden?: boolean;
}

/**
 * 智能体变量配置
 */
export interface VariableConfig {
  /** 是否启用变量系统 */
  enabled: boolean;
  /** 变量定义树 */
  definitions: VariableTreeNode[];
  /** 自定义样式（可选，用于覆盖默认徽章样式） */
  customStyles?: string;
}

/**
 * 扁平化的变量定义（用于运行时快速查询）
 */
export interface FlatVariableDefinition {
  path: string;
  displayName?: string;
  initialValue: any;
  min?: number;
  max?: number;
  description?: string;
  hidden?: boolean;
}

/**
 * 变量变更记录
 * 用于在 UI 中展示变量的变化过程
 */
export interface VariableChange {
  /** 变量路径 */
  path: string;
  /** 操作符 */
  op: VariableOperator;
  /** 操作值 */
  opValue: any;
  /** 变更前的值 */
  oldValue: any;
  /** 变更后的值 */
  newValue: any;
}

/**
 * 会话变量快照
 * 存储在消息元数据中，记录该时刻的所有变量状态
 */
export interface SessionVariableSnapshot {
  /** 变量值映射表 (path -> value) */
  values: Record<string, any>;
  /** 该节点产生的变更列表（可选） */
  changes?: VariableChange[];
  /** 快照时间戳 */
  timestamp?: number;
}