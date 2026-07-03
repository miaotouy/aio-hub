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

import type { Caiu } from "./caiu";

/**
 * 搜索相关类型定义
 */

/**
 * 搜索结果
 */
export interface SearchResult {
  /** 命中的原子知识单元 */
  caiu: Caiu;
  /** 相关性评分 (0.0 - 1.0) */
  score: number;
  /** 匹配类型: "vector", "keyword", "tag", "key" */
  matchType: "vector" | "keyword" | "tag" | "key";
  /** 高亮片段 */
  highlight: string | null;
  /** 所属知识库 ID */
  kbId: string;
  /** 所属知识库名称 */
  kbName: string;
}

/**
 * 搜索过滤器
 */
export interface SearchFilters {
  /** 指定知识库 ID 列表，为空表示搜索全部 */
  kbIds?: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 最低评分过滤 */
  minScore?: number;
  /** 是否仅包含已启用的条目 */
  enabledOnly?: boolean;
  /** 结果数量限制 */
  limit?: number;
  /** 指定检索引擎 ID */
  engineId?: string;
  /** 透镜检索：纹理 (coarse/fine) */
  texture?: "coarse" | "fine";
  /** 透镜检索：折射率 (0.0 - 1.0) */
  refractionIndex?: number;
  /** 透镜检索：显式约束标签 */
  requiredTags?: string[];
  /** 透镜检索：上下文投射向量 (用于能量衰减) */
  historyVectors?: number[][];
}

/**
 * 检索算法引擎信息
 */
export interface RetrievalEngineInfo {
  /** 引擎唯一标识 */
  id: string;
  /** 引擎名称 */
  name: string;
  /** 引擎描述 */
  description: string;
  /** 引擎图标 */
  icon: string | null;
  /** 支持的 Payload 类型: "text", "vector" */
  supportedPayloadTypes: string[];
  /** 是否需要 Embedding 模型 */
  requiresEmbedding: boolean;
  /** 引擎支持的自定义参数描述 (符合前端 SettingItem 结构) */
  parameters: any[];
}
