// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useToolResultDisplay } from "../useToolResultDisplay";
import { formatToolResult } from "../../../utils/toolResultContent";
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
