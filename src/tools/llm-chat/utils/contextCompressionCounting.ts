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

import type { ChatMessageNode } from "../types/message";
import {
  DEFAULT_CONTEXT_COMPRESSION_CONFIG,
  type ContextCompressionConfig,
  type ContextCompressionCounts,
  type ContextCompressionCountUnit,
} from "../types/llm";

/** 输入为当前分支中可见的普通消息，保留原生与 VCP 工具链的顺序。 */
export function groupCompressionMessages(
  nodes: ChatMessageNode[],
  unit: ContextCompressionCountUnit = "message"
): ChatMessageNode[][] {
  if (unit === "message") return nodes.map((node) => [node]);

  const turns: ChatMessageNode[][] = [];
  for (const node of nodes) {
    // 兼容旧压缩范围留下的开头片段，将其单独归为一组。
    if (node.role === "user" || turns.length === 0) {
      turns.push([]);
    }
    turns[turns.length - 1].push(node);
  }
  return turns;
}

export function getCompressionCounts(
  config: ContextCompressionConfig
): ContextCompressionCounts {
  return {
    countThreshold:
      config.countThreshold ??
      DEFAULT_CONTEXT_COMPRESSION_CONFIG.countThreshold!,
    protectRecentCount:
      config.protectRecentCount ??
      DEFAULT_CONTEXT_COMPRESSION_CONFIG.protectRecentCount!,
    compressCount:
      config.compressCount ?? DEFAULT_CONTEXT_COMPRESSION_CONFIG.compressCount!,
    minHistoryCount:
      config.minHistoryCount ??
      DEFAULT_CONTEXT_COMPRESSION_CONFIG.minHistoryCount!,
  };
}

/** 活动方式继续使用既有平铺字段，便于旧配置、导入和参数编辑器兼容。 */
export function switchCompressionCountUnit(
  config: ContextCompressionConfig,
  unit: ContextCompressionCountUnit
): ContextCompressionConfig {
  const previousUnit = config.countUnit ?? "message";
  if (unit === previousUnit) return config;

  const countsByUnit = {
    ...config.countsByUnit,
    [previousUnit]: getCompressionCounts(config),
  };
  return {
    ...config,
    countUnit: unit,
    countsByUnit,
    ...(countsByUnit[unit] ??
      getCompressionCounts(DEFAULT_CONTEXT_COMPRESSION_CONFIG)),
  };
}
