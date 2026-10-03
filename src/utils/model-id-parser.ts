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
 * 多格式模型 ID 解析器
 *
 * 从用户粘贴的自由文本中提取模型 ID 列表。支持：
 * - 逗号 / 分号 / 空白分隔的列表（含全角标点）
 * - 按行分隔（含 Markdown 列表标记 `- `、`* `、`1. `）
 * - 行尾注释剥离（`#` 与 `//`）
 * - 引号剥离（单引号、双引号、反引号）
 * - JSON 字符串数组
 * - OpenAI /v1/models 风格响应对象（data[].id）
 * - 配置字典（{"models": [...]} 或 {"model-a": {...}, ...}）
 *
 * 输出保持原始出现顺序并去重。
 */

/** 模型 ID 中允许出现的字符：字母数字、点、下划线、连字符、斜杠、冒号、@ */
const MODEL_ID_PATTERN = /^[A-Za-z0-9._/@:+-]+$/;

/** 判断一个字符串是否是合法的模型 ID */
export function isValidModelId(value: string): boolean {
  return value.length > 0 && value.length <= 256 && MODEL_ID_PATTERN.test(value);
}

/** 剥离行尾注释（# 或 //）。注意保护 URL 中的 //（模型 ID 场景基本无 URL，直接处理即可） */
function stripComment(line: string): string {
  // 优先处理 # 注释（模型 ID 不含 #，安全）
  const hashIndex = line.indexOf("#");
  if (hashIndex !== -1) line = line.slice(0, hashIndex);
  // 处理 // 注释：模型 ID 不含 //，安全
  const slashIndex = line.indexOf("//");
  if (slashIndex !== -1) line = line.slice(0, slashIndex);
  return line;
}

/** 剥离首尾引号（成对的单引号、双引号、反引号） */
function stripQuotes(value: string): string {
  let result = value.trim();
  for (const quote of ['"', "'", "`"]) {
    if (
      result.length >= 2 &&
      result.startsWith(quote) &&
      result.endsWith(quote)
    ) {
      result = result.slice(1, -1).trim();
    }
  }
  return result;
}

/** 剥离 Markdown 列表标记与序号标记 */
function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "");
}

/** 从 JSON 值中递归提取模型 ID */
function extractModelIdsFromJson(value: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof value === "string") {
    const trimmed = stripQuotes(value);
    return isValidModelId(trimmed) ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractModelIdsFromJson(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // OpenAI /v1/models 风格：{ data: [{ id: "..." }] }
    if (Array.isArray(record.data)) {
      return record.data.flatMap((item: unknown) => {
        if (
          item !== null &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).id === "string"
        ) {
          const id = (item as Record<string, unknown>).id as string;
          return isValidModelId(id) ? [id] : [];
        }
        return extractModelIdsFromJson(item, depth + 1);
      });
    }
    // { models: [...] } 配置字典
    if (record.models !== undefined) {
      return extractModelIdsFromJson(record.models, depth + 1);
    }
    // { "model-a": {...}, "model-b": "..." } 字典：键作为模型 ID
    const keys = Object.keys(record)
      .map((key) => key.trim())
      .filter((key) => isValidModelId(key));
    if (keys.length > 0) return keys;
    // 兜底：递归值
    return Object.values(record).flatMap((item) =>
      extractModelIdsFromJson(item, depth + 1)
    );
  }
  return [];
}

/** 尝试按 JSON 解析文本并提取模型 ID；失败返回 null */
function tryParseJson(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const data = JSON.parse(trimmed);
    const ids = extractModelIdsFromJson(data);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

/** 从自由文本中提取模型 ID 列表（保持顺序、去重） */
export function parseModelIdList(text: string): string[] {
  if (!text || !text.trim()) return [];

  // 1. 尝试 JSON 格式
  const jsonIds = tryParseJson(text);
  if (jsonIds) return dedupe(jsonIds);

  // 2. 按行切分，剥离列表标记与注释
  const lines = text.split(/\r?\n/);
  const candidates: string[] = [];
  for (const rawLine of lines) {
    let line = stripListMarker(rawLine);
    line = stripComment(line);
    line = line.trim();
    if (!line) continue;

    // 3. 行内再按分隔符切分（逗号、分号、空白、竖线）
    const parts = line.split(/[,;，；|\t]+/);
    for (const part of parts) {
      const cleaned = stripQuotes(part.trim());
      if (!cleaned) continue;
      // 空白分隔兜底：单个 part 内仍可能含空格分隔的多个 ID
      for (const token of cleaned.split(/\s+/)) {
        const id = stripQuotes(token.trim());
        if (isValidModelId(id)) candidates.push(id);
      }
    }
  }
  return dedupe(candidates);
}

/** 去重（保持原始顺序） */
function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}