// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useToolResultDisplay } from "../useToolResultDisplay";
import {
  formatToolResult,
  previewToolResult,
} from "../../../utils/toolResultContent";
afterEach(() => vi.useRealTimers());
// Protect timely first output, bounded trailing refresh and authoritative completion after cancellation.
it("shows first text immediately, coalesces live updates and flushes completion", async () => {
  vi.useFakeTimers();
  const source = ref(""),
    expanded = ref(true),
    streaming = ref(true);
  const scope = effectScope();
  const display = scope.run(() =>
    useToolResultDisplay({
      source: () => source.value,
      expanded: () => expanded.value,
      streaming: () => streaming.value,
    })
  )!;
  source.value = '{"first":';
  expect(display.content.value).toBe(source.value);
  source.value = '{"first":1';
  source.value = '{"first":12';
  expect(display.content.value).toBe('{"first":');
  await vi.advanceTimersByTimeAsync(100);
  expect(display.content.value).toBe('{"first":12');
  source.value = '{"first":123}';
  streaming.value = false;
  expect(display.content.value).toBe('{\n  "first": 123\n}');
  await vi.advanceTimersByTimeAsync(200);
  expect(display.content.value).toBe('{\n  "first": 123\n}');
  expanded.value = false;
  source.value =
    "[[AIO工具调用结果信息汇总:\r\nlatest\r\nAIO工具调用结果结束]]";
  expect(display.preview.value).toBe("latest");
  expect(display.content.value).toBe("");
  expanded.value = true;
  expect(display.content.value).toBe("latest");
  streaming.value = true;
  source.value = "pending";
  scope.stop();
  await vi.advanceTimersByTimeAsync(200);
  expect(display.content.value).toBe("latest");
});
it("keeps nested JSON values, escaped keys and surrounding tool text intact", () => {
  const value = {
    'quoted"key': [1, null, { a: { b: { c: [true, "value"] } } }],
  };
  const result = formatToolResult(
    `[[AIO工具调用结果信息汇总:\r\nBefore\r\n${JSON.stringify(value)}\r\nAfter\r\nAIO工具调用结果结束]]`
  );
  expect(
    JSON.parse(result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1))
  ).toEqual(value);
  expect(result.startsWith("Before\n")).toBe(true);
  expect(result.endsWith("\nAfter")).toBe(true);
  expect(formatToolResult('{"partial":')).toBe('{"partial":');
});

// Collapsed VCP results show useful result text, while the saved batch remains intact.
it("previews framed VCP results without protocol wrappers", () => {
  const stamp = "2026-10-30T11:16:59.391+08:00";
  const raw = `<<<[ROLE_DIVIDE_USER]>>>\n<<<[VCP_TOOL_BATCH_START:${stamp}]>>>\n[[VCP调用结果信息汇总:\n- 工具名称: DailyNote\n- 执行状态: SUCCESS\n- 返回内容: done\nVCP调用结果结束]]\n<<<[VCP_TOOL_BATCH_END:${stamp}]>>>\n<<<[END_ROLE_DIVIDE_USER]>>>`;
  expect(previewToolResult(raw)).toBe(
    "- 工具名称: DailyNote\n- 执行状态: SUCCESS\n- 返回内容: done"
  );
  expect(formatToolResult(raw)).toBe(raw);
});
