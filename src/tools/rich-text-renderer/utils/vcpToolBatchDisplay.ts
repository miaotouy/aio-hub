// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { findVcpRoleEnd, findVcpToolBatch } from "@/utils/vcpToolBatch";
import type { VcpToolNode } from "../types";
import {
  normalizeToolStatus,
  parseToolSummaryItems,
  type ToolSummaryItem,
} from "@/utils/vcpToolSummary";

type ToolResult = Pick<
  VcpToolNode["props"],
  "tool_name" | "status" | "resultContent" | "raw"
>;

// Recognize only complete, top-level legacy envelopes. Result values stay
// literal: they never enter the Markdown, HTML or tool-request parser.
export function parseVcpToolBatchDisplay(content: string):
  | {
      results: ToolResult[];
      summaryItems: ToolSummaryItem[];
      calls: ToolSummaryItem[];
    }
  | undefined {
  const results: ToolResult[] = [];
  const summaries: ToolSummaryItem[] = [];
  let remaining = content.trim();
  while (remaining) {
    const result =
      /^\[\[VCP调用结果信息汇总:[ \t]*\r?\n[ \t]*-\s*工具名称:[ \t]*([^\r\n]+)\r?\n[ \t]*-\s*执行状态:[ \t]*([^\r\n]+)\r?\n[ \t]*-\s*返回内容:[ \t]*([\s\S]*?)\r?\nVCP调用结果结束\]\]/.exec(
        remaining
      );
    if (result) {
      results.push({
        raw: result[0],
        tool_name: result[1].trim(),
        status: result[2].trim(),
        resultContent: result[3].trim(),
      });
      remaining = remaining.slice(result[0].length).trim();
      continue;
    }
    const summary =
      /^\[本轮工具调用摘要:\]([\s\S]*?)\[本轮工具调用摘要结束\]/.exec(
        remaining
      );
    if (!summary) return;
    const items = parseToolSummaryItems(summary[1]);
    if (!items.length) return;
    summaries.push(...items);
    remaining = remaining.slice(summary[0].length).trim();
  }
  if (!results.length && !summaries.length) return;
  return {
    results,
    // The server emits one summary entry per invocation, including hidden results.
    calls: summaries.length
      ? summaries
      : results.map((result) => ({
          label: result.tool_name + " " + result.status,
          toolName: result.tool_name,
          status: normalizeToolStatus(result.status ?? ""),
          statusLabel: result.status ?? "",
        })),
    summaryItems: summaries.filter(
      (item) =>
        !results.some(
          (result) =>
            result.tool_name.toLowerCase() ===
              item.toolName.trim().toLowerCase() &&
            normalizeToolStatus(result.status ?? "") === item.status
        )
    ),
  };
}

/** Project a split tool message into the host card, retaining literal result values. */
export function parseVcpToolMessageDisplay(content: string, complete = true) {
  let body = content.trim();
  let closed = complete;
  let roleClosed = true;
  const open = "<<<[ROLE_DIVIDE_USER]>>>";
  const end = "<<<[END_ROLE_DIVIDE_USER]>>>";
  if (body.startsWith(open)) {
    const endIndex = findVcpRoleEnd(body, end, open.length);
    if (endIndex >= 0 && endIndex === body.length - end.length) {
      body = body.slice(open.length, endIndex).trim();
      closed = true;
    } else if (endIndex < 0) {
      body = body.slice(open.length).trim();
      roleClosed = false;
      closed = false;
    }
  }
  const candidate = findVcpToolBatch(body);
  const batch =
    candidate?.start === 0 && candidate.end === body.length
      ? candidate
      : undefined;
  if (batch) {
    closed = roleClosed && batch.closed;
    body = body.slice(batch.contentStart, batch.contentEnd).trim();
  }
  const display =
    roleClosed && (!batch || batch.closed)
      ? parseVcpToolBatchDisplay(body)
      : undefined;
  // Legacy result/summary terminators close their payload before the next role arrives.
  if (!batch && display) closed = true;
  const results = (display?.results ?? []).map((result) => {
    const sameTool = (name: string) =>
      name.trim().toLowerCase() === result.tool_name.trim().toLowerCase();
    const calls =
      display?.calls.filter((call) => sameTool(call.toolName)) ?? [];
    const resultCount = display?.results.filter((entry) =>
      sameTool(entry.tool_name)
    ).length;
    // A unique summary/result pairing can refine a transport-level SUCCESS.
    // Repeated or partially hidden calls have no reliable per-result identity.
    const statusKind =
      calls.length === 1 && resultCount === 1
        ? calls[0].status
        : normalizeToolStatus(result.status ?? "");
    return {
      ...result,
      statusKind,
      statusLabel:
        statusKind === "success"
          ? "成功"
          : statusKind === "error"
            ? "失败"
            : "已返回",
    };
  });
  return {
    results,
    summaryItems: (display?.summaryItems ?? []).filter(
      (item) =>
        !results.some(
          (result) =>
            result.tool_name.trim().toLowerCase() ===
              item.toolName.trim().toLowerCase() &&
            result.statusKind === item.status
        )
    ),
    calls: display?.calls ?? [],
    content: body,
    closed,
  };
}
