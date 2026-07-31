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

import type { RecallEntry } from "./recall-entry";

export type RecallProfile = "semantic" | "associative";
export type RecallSignalType =
  | "key"
  | "keyword"
  | "content-vector"
  | "tag-vector"
  | "tag-graph"
  | "lens"
  | "blender"
  | "multi-signal";

export interface RecallSignal {
  signalType: RecallSignalType;
  score: number;
}

export interface RecallTrace {
  algorithmVersion: string;
  profile: RecallProfile | null;
  engineId: string;
  candidateScore: number;
  fusionScore: number;
  minScore: number | null;
  passedMinScore: boolean;
  rank: number;
}

/**
 * 搜索相关类型定义
 */

/**
 * 搜索结果
 */
export interface RecallResult {
  /** 命中的原子知识单元 */
  entry: RecallEntry;
  /** 相关性评分 (0.0 - 1.0) */
  score: number;
  /** 匹配类型: "vector", "keyword", "tag", "key" */
  matchType:
    | "vector"
    | "keyword"
    | "tag"
    | "tag_vector"
    | "tag_graph"
    | "key"
    | "algorithmic"
    | "comprehensive"
    | "pipeline"
    | "lens"
    | "blender"
    | "multi_signal";
  /** 高亮片段 */
  highlight: string | null;
  /** 所属思绪集 ID */
  recallId: string;
  /** 所属思绪集名称 */
  recallName: string;
  signals?: RecallSignal[];
  trace?: RecallTrace | null;
}

/**
 * 搜索过滤器
 */
export interface RecallSearchFilters {
  /** 指定思绪集 ID 列表，为空表示搜索全部 */
  recallIds?: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 最低评分过滤 */
  minScore?: number;
  /** 是否仅包含已启用的条目 */
  enabledOnly?: boolean;
  /** 结果数量限制 */
  limit?: number;
}
