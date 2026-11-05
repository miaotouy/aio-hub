// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
/** Cheap normalization shared by live output, summaries and completed formatting. */
export function normalizeToolResult(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/^\[\[AIO工具调用结果信息汇总:\s*/i, "")
    .replace(/\s*AIO工具调用结果结束\]\]$/i, "")
    .trim();
}
export function previewToolResult(content: string): string {
  const prefix = normalizeToolResult(content.slice(0, 512));
  return (
    prefix.slice(0, 120) +
    (prefix.length > 120 || content.length > 512 ? "..." : "")
  );
}
/** Format only complete, requested results. Arbitrary partial JSON stays readable as text. */
export function formatToolResult(content: string): string {
  const text = normalizeToolResult(content);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return text;
  try {
    const format = (value: unknown, depth = 0): string => {
      if (value === null || typeof value !== "object" || depth >= 4)
        return JSON.stringify(value);
      const indent = "  ".repeat(depth),
        next = "  ".repeat(depth + 1);
      if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return `[\n${value.map((v) => next + format(v, depth + 1)).join(",\n")}\n${indent}]`;
      }
      const entries = Object.entries(value);
      if (!entries.length) return "{}";
      return `{\n${entries.map(([key, v]) => `${next}${JSON.stringify(key)}: ${format(v, depth + 1)}`).join(",\n")}\n${indent}}`;
    };
    return (
      text.slice(0, start) +
      format(JSON.parse(text.slice(start, end + 1))) +
      text.slice(end + 1)
    );
  } catch {
    return text;
  }
}
