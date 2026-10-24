// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type { MessageToolbarLayout } from "../types/message-toolbar";

export function createDefaultMessageToolbarLayout(): MessageToolbarLayout {
  return {
    version: 1,
    pinnedActionIds: ["copy", "edit", "regenerate"],
    expanded: false,
  };
}

export function normalizeMessageToolbarLayout(
  value: unknown
): MessageToolbarLayout {
  const source =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const fallback = createDefaultMessageToolbarLayout();
  return {
    version: 1,
    pinnedActionIds: [
      ...new Set(
        (Array.isArray(source.pinnedActionIds)
          ? source.pinnedActionIds
          : fallback.pinnedActionIds
        ).filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      ),
    ],
    expanded:
      typeof source.expanded === "boolean"
        ? source.expanded
        : fallback.expanded,
  };
}
