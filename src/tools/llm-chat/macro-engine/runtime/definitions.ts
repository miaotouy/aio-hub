// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { MacroContext } from "../MacroContext";

export enum MacroPhase {
  /** 预处理阶段：处理状态变更宏（如 setvar, incvar） */
  PRE_PROCESS = "pre-process",
  /** 替换阶段：替换静态值（如 {{user}}, {{char}}） */
  SUBSTITUTE = "substitute",
  /** 后处理阶段：执行动态函数（如 {{time}}, {{random}}） */
  POST_PROCESS = "post-process",
}

/**
 * 宏类型
 */
export enum MacroType {
  /** 简单值替换 */
  VALUE = "value",
  /** 需要执行的函数 */
  FUNCTION = "function",
  /** 变量操作 */
  VARIABLE = "variable",
}

/**
 * 宏定义
 */
export interface MacroDefinition {
  /** 宏名称（不带 {{}}） */
  name: string;
  /** 宏类型 */
  type: MacroType;
  /** 执行阶段 */
  phase: MacroPhase;
  /** 宏描述（用于文档和提示） */
  description: string;
  /** 使用示例 */
  example?: string;
  /** 是否接受参数 */
  acceptsArgs: boolean;
  /** 参数数量（undefined 表示可变参数） */
  argCount?: number;
  /** 优先级（用于自动补全排序） */
  priority?: number;
  /** 是否已实现（未实现的宏不会在UI中显示） */
  supported?: boolean;
  /**
   * 是否不依赖上下文（可直接调用）
   * 标记为 true 的宏可以在没有完整 MacroContext 的情况下执行
   */
  contextFree?: boolean;
  /** 依赖本轮时间、会话或可变状态，供上下文诊断使用。 */
  dynamic?: boolean;
  /** 执行函数 */
  execute: (context: MacroContext, args?: string[]) => string | Promise<string>;
}
