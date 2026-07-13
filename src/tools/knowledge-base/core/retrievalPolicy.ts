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

import type { SearchResult } from "../types/search";
import type { KbRetrievalRequest } from "../types/retrieval";

/**
 * 检索策略核心纯函数
 * 零 IO、零 Store 依赖，易于单测
 */

/**
 * 检查占位符是否应该激活
 */
export function shouldActivate(req: KbRetrievalRequest): boolean {
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
export function resolveRetrievalParams(req: KbRetrievalRequest): {
  kbIds: string[];
  limit: number;
  minScore: number;
  engineId?: string;
} {
  const { kbName, limit, minScore, engineId, enabledBindings, settings } = req;

  let kbIds: string[] = [];
  if (kbName) {
    // 如果指定了知识库名称，只匹配对应的 kbId
    const matched = enabledBindings.find((b) => b.kbName === kbName);
    if (matched) {
      kbIds = [matched.kbId];
    }
  } else {
    // 未指定名称时使用所有已启用的知识库
    kbIds = enabledBindings.map((b) => b.kbId);
  }

  return {
    kbIds,
    limit: limit || settings.defaultLimit || 5,
    minScore: minScore || settings.defaultMinScore || 0.3,
    engineId: engineId || settings.defaultEngineId,
  };
}

/**
 * 应用字数限制过滤结果
 */
export function applyCharLimit(
  results: SearchResult[],
  maxChars: number
): SearchResult[] {
  if (maxChars <= 0) return results;

  let currentTotal = 0;
  const filtered: SearchResult[] = [];
  for (const res of results) {
    const contentLen = res.caiu.content?.length || 0;
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
  results: SearchResult[],
  settings: KbRetrievalRequest["settings"]
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

  const itemTemplate = `**[{kbName}]** {key}
> {content}
(相关度: {score})`;

  const itemsContent = results
    .map((r) => {
      let item = itemTemplate
        .replace(/{kbName}/g, r.kbName || "未知知识库")
        .replace(/{key}/g, r.caiu.key || "无标题")
        .replace(/{content}/g, r.caiu.content || "")
        .replace(/{score}/g, r.score.toFixed(2));

      // 处理标签
      if (r.caiu.tags && r.caiu.tags.length > 0) {
        const tagsStr = r.caiu.tags.map((t: any) => t.name || t).join(", ");
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
