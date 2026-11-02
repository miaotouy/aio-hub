// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  parseVcpToolBatchDisplay,
  parseVcpToolMessageDisplay,
} from "../vcpToolBatchDisplay";

const result = (
  name: string,
  status: string,
  value: string
) => `[[VCP调用结果信息汇总:
- 工具名称: ${name}
- 执行状态: ${status}
- 返回内容: ${value}
VCP调用结果结束]]`;
const summary = (value: string) =>
  `[本轮工具调用摘要:]${value}[本轮工具调用摘要结束]`;

describe("VCP batch legacy presentation", () => {
  it("projects complete results with literal values and retains only uncovered summary items", () => {
    const value =
      "<script>window.bad = true</script>\n<<<[TOOL_REQUEST]>>>\ntool_name:「始」quoted「末」\n<<<[END_TOOL_REQUEST]>>>";
    const raw = result("DailyNote", "✅ SUCCESS", value);
    const display = parseVcpToolBatchDisplay(
      `\n\n${raw}\n\n${summary("DailyNote 调用成功；Search 调用失败。")}\n`
    );
    expect(display?.results).toEqual([
      {
        tool_name: "DailyNote",
        status: "✅ SUCCESS",
        resultContent: value,
        raw,
      },
    ]);
    expect(display?.summaryItems.map((item) => item.toolName)).toEqual([
      "Search",
    ]);
    expect(display?.summaryItems[0].status).toBe("error");
  });

  it("handles multiple CRLF results and summary-only batches", () => {
    const content =
      `${result("Read", "SUCCESS", "one")}\n${result("Write", "ERROR", "two")}`.replace(
        /\n/g,
        "\r\n"
      );
    expect(
      parseVcpToolBatchDisplay(content)?.results.map(
        (item) => item.resultContent
      )
    ).toEqual(["one", "two"]);
    expect(parseVcpToolBatchDisplay(summary("Read 调用成功。"))).toMatchObject({
      results: [],
      summaryItems: [{ toolName: "Read", status: "success" }],
    });
  });

  it("keeps incomplete or mixed payloads on the literal fallback", () => {
    const raw = result("Read", "SUCCESS", "done");
    for (const content of [
      raw.slice(0, -2),
      `quoted\n${raw}`,
      `${raw}\n<script>extra</script>`,
      "plain result",
    ]) {
      expect(parseVcpToolBatchDisplay(content)).toBeUndefined();
    }
  });
});

// The host tool card consumes names, status and literal values for both generations.
// Keep protocol examples inside a value and unfinished batches out of structural parsing.
describe("split VCP tool message projection", () => {
  it.each([false, true])(
    "projects legacy/new framing (batch: %s) into host-card fields",
    (batch) => {
      const value = "<script>quoted()</script>\n<<<[END_ROLE_DIVIDE_USER]>>>";
      const body = `${result("DailyNote", "SUCCESS", value)}\n${summary("DailyNote 调用成功；Search 调用失败。")}`;
      const stamp = "2026-10-30T11:16:59.391+08:00";
      const framed = batch
        ? `<<<[VCP_TOOL_BATCH_START:${stamp}]>>>\n${body}\n<<<[VCP_TOOL_BATCH_END:${stamp}]>>>`
        : body;
      // Old unframed results do not isolate role markers inside their own fields.
      const raw = batch
        ? `<<<[ROLE_DIVIDE_USER]>>>\n${framed}\n<<<[END_ROLE_DIVIDE_USER]>>>`
        : framed;
      const display = parseVcpToolMessageDisplay(raw);
      expect(display.closed).toBe(true);
      expect(display.results).toMatchObject([
        {
          tool_name: "DailyNote",
          statusKind: "success",
          statusLabel: "成功",
          resultContent: value,
        },
      ]);
      expect(display.summaryItems).toMatchObject([
        { toolName: "Search", status: "error" },
      ]);
      expect(display.content).toBe(body);
    }
  );

  // A complete tool payload must become inspectable before the next assistant starts.
  it.each(["legacy", "summary", "batch"])(
    "projects closed %s payloads while transport is streaming",
    (kind) => {
      const body =
        kind === "summary"
          ? summary("Read 调用成功。")
          : result("Read", "SUCCESS", "done");
      const stamp = "2026-10-30T11:16:59.391+08:00";
      const raw =
        kind === "batch"
          ? `<<<[VCP_TOOL_BATCH_START:${stamp}]>>>\n${body}\n<<<[VCP_TOOL_BATCH_END:${stamp}]>>>`
          : body;
      const display = parseVcpToolMessageDisplay(raw, false);
      expect(display.closed).toBe(true);
      if (kind === "summary")
        expect(display.summaryItems).toMatchObject([
          { toolName: "Read", status: "success" },
        ]);
      else
        expect(display.results).toMatchObject([
          { tool_name: "Read", statusKind: "success", resultContent: "done" },
        ]);
      const partial = parseVcpToolMessageDisplay(raw.slice(0, -1), false);
      expect(partial.closed).toBe(false);
      expect(partial.results).toEqual([]);
      expect(partial.summaryItems).toEqual([]);
    }
  );

  it("keeps partial and arbitrary batches literal, including quoted protocol and HTML", () => {
    const stamp = "2026-10-30T11:16:59.391+08:00";
    const body = "<script>quoted()</script>\n<<<[TOOL_REQUEST]>>>\ntext";
    const start = `<<<[VCP_TOOL_BATCH_START:${stamp}]>>>`;
    const end = `<<<[VCP_TOOL_BATCH_END:${stamp}]>>>`;
    expect(parseVcpToolMessageDisplay(`${start}\n${body}\n`)).toMatchObject({
      results: [],
      content: body,
      closed: false,
    });
    expect(
      parseVcpToolMessageDisplay(`${start}\n${body}\n${end}`)
    ).toMatchObject({ results: [], content: body, closed: true });
    expect(
      parseVcpToolMessageDisplay(
        `${start}\n${result("Read", "SUCCESS", "done")}`,
        false
      )
    ).toMatchObject({ results: [], closed: false });
  });
});
