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
 * Markdown 文本轻量处理工具
 * 主要用于 Jina 云端模式返回内容的后处理（无需完整 HTML 解析管道）
 */

/**
 * 纯净模式：剥离所有 Markdown 链接语法，只保留纯文本
 * 与 core/stages/converter.ts 中 cleanMode 的处理逻辑保持一致
 * - 图片链接: ![alt](url) -> [图片]
 * - 普通链接: [text](url) -> text
 */
export function stripMarkdownLinks(content: string): string {
  return content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[图片]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/**
 * 从 Markdown 内容中提取一级标题作为页面标题
 * 优先匹配内容首个 `# 标题`，未命中时回退到 Jina 响应的 "Title:" 元信息行
 */
export function extractTitleFromMarkdown(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }
  // Jina Reader 响应头部的元信息格式: "Title: xxx"
  const metaMatch = content.match(/^Title:\s*(.+)$/m);
  return metaMatch?.[1]?.trim() || "";
}
