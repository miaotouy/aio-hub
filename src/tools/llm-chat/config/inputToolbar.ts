// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type {
  InputToolbarActionId,
  InputToolbarLayout,
} from "../types/input-toolbar";

export const INPUT_TOOLBAR_ACTION_IDS: InputToolbarActionId[] = [
  "attachment",
  "temporary-model",
  "knowledge",
  "macro",
  "streaming",
  "sessions",
  "new-session",
  "tool-settings",
  "complete",
  "continuation-model",
  "translate",
  "compress",
  "convert-paths",
  "cleanup-placeholders",
  "analyze-context",
  "cut-draft",
  "paste-draft",
  "expand",
  "unlock-height",
  "input-settings",
];

export function createCompactToolbarLayout(): InputToolbarLayout {
  return {
    version: 1,
    pinnedActionIds: ["attachment", "temporary-model", "knowledge"],
  };
}

export function createLegacyToolbarLayout(): InputToolbarLayout {
  return {
    version: 1,
    pinnedActionIds: [
      "streaming",
      "macro",
      "attachment",
      "knowledge",
      "sessions",
      "temporary-model",
      "tool-settings",
      "input-settings",
      "expand",
    ],
  };
}

export function createFullToolbarLayout(): InputToolbarLayout {
  return {
    version: 1,
    pinnedActionIds: [...INPUT_TOOLBAR_ACTION_IDS],
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeInputToolbarLayout(
  value: unknown,
  fallback: InputToolbarLayout = createCompactToolbarLayout()
): InputToolbarLayout {
  const source = record(value);
  const ids = Array.isArray(source.pinnedActionIds)
    ? source.pinnedActionIds
    : fallback.pinnedActionIds;
  return {
    version: 1,
    pinnedActionIds: [
      ...new Set(
        ids.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      ),
    ],
  };
}

/** Only persisted old settings take the legacy fallback; fresh configs use createDefault. */
export function mergeInputToolbarLayout(value: unknown): InputToolbarLayout {
  return value === undefined
    ? createLegacyToolbarLayout()
    : normalizeInputToolbarLayout(value);
}

export function partitionToolbarActions<
  T extends { id: string; visible?: boolean },
>(
  actions: readonly T[],
  pinnedIds: readonly string[]
): { pinned: T[]; menu: T[] } {
  const available = actions.filter((action) => action.visible !== false);
  const byId = new Map(available.map((action) => [action.id, action]));
  const pinned = [...new Set(pinnedIds)].flatMap((id) =>
    byId.has(id) ? [byId.get(id)!] : []
  );
  const selected = new Set(pinned.map((action) => action.id));
  return {
    pinned,
    menu: available.filter((action) => !selected.has(action.id)),
  };
}

/** Reserve the always-visible more button; widths match the toolbar's 32px buttons / 2px gap. */
export function visibleToolbarActionCount(
  width: number,
  count: number
): number {
  return Math.min(count, Math.max(0, Math.floor((width - 32) / 34)));
}
