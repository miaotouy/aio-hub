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

import type { RecallResult } from "../types/search";
import type { RecallRetrievalRequest } from "../types/retrieval";

/**
 * 检索策略核心纯函数
 * 零 IO、零 Store 依赖，易于单测
 */

/**
 * 检查占位符是否应该激活
 */
export function shouldActivate(req: RecallRetrievalRequest): boolean {
  const { mode, modeParams, turnCount, recentMessageTexts, settings } = req;

  switch (mode) {
    case "always":
    case "static":
      return true;
    case "turn": {
      const interval = parseInt(modeParams?.[0] || "1");
      return turnCount > 0 && turnCount % interval === 0;
    }
    case "gate": {
      const keywords = modeParams || [];
      if (keywords.length === 0) return true;

      const scanDepth = settings.gateScanDepth || 3;
      const scanTexts = recentMessageTexts.slice(-scanDepth);
      return scanTexts.some((text) => keywords.some((kw) => text.includes(kw)));
    }
    default:
      return true;
  }
}

/**
 * 解析最终使用的检索参数
 */
export function resolveRetrievalParams(req: RecallRetrievalRequest): {
  recallIds: string[];
  limit: number;
  minScore: number;
  engineId?: string;
} {
  const { recallName, limit, minScore, engineId, enabledBindings, settings } = req;

  let recallIds: string[] = [];
  if (recallName) {
    // 如果指定了思绪集名称，只匹配对应的 recallId
    const matched = enabledBindings.find((b) => b.recallName === recallName);
    if (matched) {
      recallIds = [matched.recallId];
    }
  } else {
    // 未指定名称时使用所有已启用的思绪集
    recallIds = enabledBindings.map((b) => b.recallId);
  }

  return {
    recallIds,
    limit: limit || settings.defaultLimit || 5,
    minScore: minScore || settings.defaultMinScore || 0.3,
    engineId: engineId || settings.defaultEngineId,
  };
}

/**
 * 应用字数限制过滤结果
 */
export function applyCharLimit(
  results: RecallResult[],
  maxChars: number
): RecallResult[] {
  if (maxChars <= 0) return results;

  let currentTotal = 0;
  const filtered: RecallResult[] = [];
  for (const res of results) {
    const contentLen = res.entry.content?.length || 0;
    if (currentTotal + contentLen <= maxChars) {
      filtered.push(res);
      currentTotal += contentLen;
    } else {
      break;
    }
  }
  return filtered;
}

/**
 * 格式化检索结果为注入文本
 */
export function formatResults(
  results: RecallResult[],
  settings: RecallRetrievalRequest["settings"]
): string {
  if (results.length === 0) {
    return settings.emptyText || "（未检索到相关知识）";
  }

  const template =
    settings.resultTemplate ||
    `---
📚 相关知识 (共 {count} 条)

{items}
---`;

  const itemTemplate = `**[{recallName}]** {key}
> {content}
(相关度: {score})`;

  const itemsContent = results
    .map((r) => {
      let item = itemTemplate
        .replace(/{recallName}/g, r.recallName || "未知思绪集")
        .replace(/{key}/g, r.entry.key || "无标题")
        .replace(/{content}/g, r.entry.content || "")
        .replace(/{score}/g, r.score.toFixed(2));

      // 处理标签
      if (r.entry.tags && r.entry.tags.length > 0) {
        const tagsStr = r.entry.tags.map((t: any) => t.name || t).join(", ");
        item = item.replace(/{tags}/g, tagsStr);
      } else {
        item = item.replace(/{tags}/g, "");
      }

      return item;
    })
    .join("\n\n");

  return template
    .replace(/{count}/g, results.length.toString())
    .replace(/{items}/g, itemsContent);
}
