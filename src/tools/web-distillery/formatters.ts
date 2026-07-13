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

import type { FetchResult, ExtractResult } from "./types";
import { getLocalISOString } from "@/utils/time";

/**
 * 格式化网页提取结果为 Markdown 文本（Agent 专用）
 */
export function formatFetchResult(result: FetchResult | ExtractResult): string {
  if (!result) return "错误: 无效的提取结果。";
  const lines: string[] = [];

  lines.push("## 网页提取结果");
  lines.push("");
  lines.push(`- **URL**: ${result.url || "未知"}`);
  lines.push(`- **标题**: ${result.title || "无标题"}`);
  lines.push(`- **提取模式**: ${result.mode}`);
  lines.push(`- **内容长度**: ${result.contentLength ?? 0} 字符`);
  lines.push(`- **质量评分**: ${result.quality ?? 0}`);
  lines.push(`- **获取时间**: ${result.fetchedAt || getLocalISOString()}`);

  if (result.metadata) {
    if (result.metadata.author)
      lines.push(`- **作者**: ${result.metadata.author}`);
    if (result.metadata.publishDate)
      lines.push(`- **发布日期**: ${result.metadata.publishDate}`);
    if (result.metadata.language)
      lines.push(`- **语言**: ${result.metadata.language}`);
  }

  if (result.warnings && result.warnings.length > 0) {
    lines.push("");
    lines.push("### ⚠️ 警告");
    result.warnings.forEach((w) => lines.push(`- ${w}`));
  }

  // 检查是否是 ExtractResult (Smart Mode)
  const extractResult = result as ExtractResult;
  if (extractResult.discoveredApis && extractResult.discoveredApis.length > 0) {
    lines.push("");
    lines.push("### 🔌 发现的 API");
    lines.push("| 方法 | URL | 内容类型 | 时间 |");
    lines.push("|------|-----|----------|------|");
    extractResult.discoveredApis.slice(0, 10).forEach((api) => {
      lines.push(
        `| ${api.method} | ${api.url} | ${api.contentType} | ${api.timestamp} |`
      );
    });
    if (extractResult.discoveredApis.length > 10) {
      lines.push(
        `*... 还有 ${extractResult.discoveredApis.length - 10} 个 API 未列出*`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  if (result.content.trim()) {
    lines.push(result.content);
  } else {
    lines.push("*未提取到正文内容。*");
  }

  return lines.join("\n").trim();
}
