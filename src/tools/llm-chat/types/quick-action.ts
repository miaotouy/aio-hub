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
 * 快捷操作 (Quick Actions) 类型定义
 */

export interface QuickAction {
  /** 唯一标识 */
  id: string;
  /** 按钮显示的文本 */
  label: string;
  /** 模板内容，支持 {{input}} 占位符 */
  content: string;
  /** 点击后是否自动发送 */
  autoSend: boolean;
  /** 是否在操作区的组内显示（默认 true） */
  isEnabled?: boolean;
  /** 详细描述 */
  description?: string;
  /** 绑定的快捷键 (可选) */
  hotkey?: string;
  /** 行处理配置 (可选) */
  lineProcessing?: {
    /** 是否启用 */
    enabled: boolean;
    /** 每一行的前缀 */
    prefix?: string;
    /** 每一行的后缀 */
    suffix?: string;
    /** 正则模式 */
    regexPattern?: string;
    /** 正则替换内容 */
    regexReplace?: string;
    /** 正则修饰符 */
    regexFlags?: string;
  };
}

export interface QuickActionSet {
  /** 唯一标识 */
  id: string;
  /** 组名，如 "代码助手" */
  name: string;
  /** 组描述 */
  description?: string;
  /** 包含的操作列表 */
  actions: QuickAction[];
  /** 是否启用 */
  isEnabled: boolean;
  /** 最后更新时间 */
  updatedAt: string;
}

/** 快捷操作组元数据 (用于索引文件) */
export interface QuickActionSetMetadata {
  id: string;
  name: string;
  description?: string;
  actionCount: number;
  isEnabled: boolean;
  updatedAt: string;
}

/** 快捷操作索引文件结构 */
export interface QuickActionIndex {
  /** 快捷操作组元数据列表 */
  quickActionSets: QuickActionSetMetadata[];
  /** 版本号 */
  version: string;
}
