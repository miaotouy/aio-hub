// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { getToolResultContent, stringifyToolResult } from "../toolResult";

// Preserve authored text while keeping ordinary content-shaped business data intact.
it("reads authored text blocks and retains the JSON fallback for domain objects", () => {
  const content = [{ type: "text" as const, text: "  正文\r\nC:\\work\n" }];
  expect(stringifyToolResult({ success: true, content })).toBe(content[0].text);
  expect(stringifyToolResult("plain text")).toBe("plain text");
  const domain = { content: [{ success: true, data: { entries: [] } }] };
  expect(getToolResultContent(domain)).toBeUndefined();
  expect(JSON.parse(stringifyToolResult(domain))).toEqual(domain);
  expect(stringifyToolResult(null)).toBe("null");
});

it("recognizes image blocks without dropping them from local serialization", () => {
  const content = [
    { type: "text" as const, text: "image" },
    {
      type: "image_url" as const,
      image_url: { url: "data:image/png;base64,b2s=" },
    },
  ];
  expect(getToolResultContent({ content })).toBe(content);
  expect(JSON.parse(stringifyToolResult({ content }))).toEqual({ content });
});
