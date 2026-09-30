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
 * 斜杠命令 (Slash Commands) 类型定义
 *
 * 聚合来源：
 * - 系统内置指令（/clear 等）
 * - 已启用的快捷操作组（每组即一个自定义装配种类）
 */

/** 预定义装配种类标识（支持通过来源动态扩展） */
export type SlashCommandCategory =
  | "system" // 系统操作
  | "prompt" // 提示词预设 / 装配
  | "role" // 角色设定
  | "format" // 格式规范
  | "workflow" // 工作流与思考链
  | "custom"; // 用户自定义装配种类

/** 斜杠命令执行上下文，由编辑器组件注入 */
export interface ChatInputContext {
  /** 获取当前输入框完整文本 */
  getValue(): string;
  /** 用指定文本替换整个输入框内容 */
  replaceValue(text: string): void;
  /** 在当前光标处插入文本 */
  insertText(text: string): void;
  /** 请求发送当前内容（用于 autoSend 类指令） */
  requestSubmit(): void;
  /** 聚焦输入框 */
  focus(): void;
}

/** 斜杠命令条目 */
export interface SlashCommandItem {
  /** 唯一标识（含来源前缀，如 quick-action:{setId}:{actionId}） */
  id: string;
  /** 指令名（不含斜杠，如 "review"） */
  name: string;
  /** 友好显示名称（如 "代码审校框架"） */
  displayName: string;
  /** 描述或功能摘要 */
  description: string;
  /** 装配种类标识（支持动态扩展，快捷操作组使用其组 ID） */
  category: string;
  /** 种类中文标签（如 "工作流规范"），快捷操作组使用组名 */
  categoryLabel?: string;
  /** 图标（lucide 组件），可选 */
  icon?: unknown;
  /** 插入文本还是执行前端动作 */
  type: "insert" | "action";
  /** 插入的内容模板，支持 {{宏}}，由宏引擎在发送时解析 */
  template?: string;
  /** 插入后是否自动发送（透传自快捷操作 autoSend） */
  autoSend?: boolean;
  /** action 型命令的执行函数 */
  execute?: (context: ChatInputContext) => Promise<void> | void;
}

/** 按装配种类分组后的结构 */
export interface SlashCommandGroup {
  category: string;
  categoryLabel: string;
  items: SlashCommandItem[];
}
