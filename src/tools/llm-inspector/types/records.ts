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
 * LLM Inspector — 请求/响应记录数据类型
 *
 * 这里聚合「一次 HTTP 交互」的所有数据结构：
 * - {@link RequestRecord} / {@link ResponseRecord}：单向记录；
 * - {@link CombinedRecord}：组合后的双向记录（含来源 + Inspector 元数据）；
 * - {@link FilterOptions}：列表过滤选项（搜索 / 状态码）。
 */

/** 单条请求记录 */
export interface RequestRecord {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  request_size: number;
}

/** 单条响应记录 */
export interface ResponseRecord {
  id: string;
  timestamp: number;
  status: number;
  headers: Record<string, string>;
  body?: string;
  response_size: number;
  duration_ms: number;
}

/**
 * 记录来源（C1 引入，向后兼容可选）
 *
 * - `external`: 来自 Rust 外部 HTTP 代理（旧链路），默认值。
 * - `internal`: 来自前端 `inspectorHookRegistry` 钩子（新链路）。
 */
export type RecordSource = "internal" | "external";

/**
 * 记录附带的 Inspector 元数据（C1 引入，向后兼容可选）
 *
 * 仅 internal 来源会填充；字段对齐 `types/hooks.ts` 中的
 * `InspectorContextMetadata`。
 */
export interface RecordInspectorMetadata {
  profileId?: string;
  modelId?: string;
  sessionId?: string;
  toolName?: string;
  purpose?: string;
}

/** 一次完整的 HTTP 交互记录（请求 + 可选响应） */
export interface CombinedRecord {
  id: string;
  request: RequestRecord;
  response?: ResponseRecord;
  /**
   * 记录来源（向后兼容）
   *
   * 未标注的旧记录视为 `external`。`addRequestRecord` 在未显式传入时默认填
   * `external`，因此现有 Rust 外部代理路径无需修改。
   */
  source?: RecordSource;
  /**
   * Inspector 元数据（向后兼容）
   *
   * 仅 internal 来源会填充，用于上下文链路展示。
   */
  inspectorMetadata?: RecordInspectorMetadata;
}

/** 列表过滤选项 */
export interface FilterOptions {
  searchQuery: string;
  filterStatus: string;
}
