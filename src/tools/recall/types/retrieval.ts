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
 * 思绪集检索请求与响应类型定义
 */

/**
 * 思绪集检索请求对象
 * 完全中立，不依赖 llm-chat 的特定类型
 */
export interface RecallRetrievalRequest {
  // —— 占位符参数（chat 从 KBPlaceholder 映射）——
  /** 指定的思绪集名称 (可选) */
  recallName?: string;
  /** 召回上限 */
  limit?: number;
  /** 最低相关度分数阈值 */
  minScore?: number;
  /** 激活模式: always | gate | turn | static */
  mode: "always" | "gate" | "turn" | "static";
  /** 模式特定参数 (如标签列表、轮次数、条目 ID 列表) */
  modeParams?: string[];
  /** 检索引擎 ID (可选，覆盖默认设置) */
  engineId?: string;

  // —— 查询文本（chat 从消息树提取）——
  /** 主查询文本 (通常是当前用户消息) */
  userText: string;
  /** 次查询文本 (通常是最近 AI 回复) */
  aiText: string;

  // —— 激活判断所需的中立上下文 ——
  /** 当前对话轮次 (用于 turn 模式) */
  turnCount: number;
  /** 最近几条消息的纯文本 (用于 gate 模式扫描) */
  recentMessageTexts: string[];

  // —— 检索配置（chat 从 knowledgeSettings 映射）——
  settings: {
    /** 默认检索引擎 ID */
    defaultEngineId?: string;
    /** 默认召回上限 */
    defaultLimit?: number;
    /** 默认最低分数阈值 */
    defaultMinScore?: number;
    /** 最大召回字符数限制 (0 表示不限制) */
    maxRecallChars?: number;
    /** 是否启用缓存 */
    enableCache?: boolean;
    /** Gate 模式扫描深度 */
    gateScanDepth?: number;
    /** 结果格式化模板 */
    resultTemplate?: string;
    /** 无结果时的占位文本 */
    emptyText?: string;
  };

  // —— Agent 绑定的已启用思绪集（chat 从 bindings 映射）——
  /** 当前 Agent 绑定的已启用思绪集列表 */
  enabledBindings: Array<{ recallId: string; recallName: string }>;
}

/**
 * 思绪集检索响应对象
 */
export interface RecallRetrievalResponse {
  /** 是否已激活检索 (如果为 false，chat 应删除占位符) */
  activated: boolean;
  /** 已格式化好的注入文本 */
  content: string;
  /** 命中的结果数量 */
  resultCount: number;
}
