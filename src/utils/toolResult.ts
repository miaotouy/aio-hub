// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { ToolResultContent } from "@/services/types";

/** Recognize content blocks, keeping business-object arrays out of the media protocol. */
export function getToolResultContent(
  value: unknown
): ToolResultContent[] | undefined {
  const content = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object" && "content" in value
      ? value.content
      : undefined;
  if (!Array.isArray(content) || !content.length) return;
  if (
    !content.every((part) => {
      if (part === null || typeof part !== "object") return false;
      if (part.type === "text") return typeof part.text === "string";
      return (
        part.type === "image_url" &&
        part.image_url !== null &&
        typeof part.image_url === "object" &&
        typeof part.image_url.url === "string"
      );
    })
  )
    return;
  return content;
}

/** Prefer authored text; ordinary objects retain their existing JSON representation. */
export function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  const content = getToolResultContent(value);
  if (content?.every((part) => part.type === "text")) {
    return content.map((part) => part.text).join("\n");
  }
  return JSON.stringify(value ?? null);
}
