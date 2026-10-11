// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type {
  InputToolbarActionId,
  InputToolbarLayout,
  QuickActionReference,
} from "../types/input-toolbar";
import type { QuickActionSet } from "../types/quick-action";

export const INPUT_TOOLBAR_ACTION_IDS: InputToolbarActionId[] = [
  "attachment",
  "temporary-model",
  "knowledge",
  "macro",
  "streaming",
  "sessions",
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
    quickActions: { mode: "menu", pinned: [] },
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
    quickActions: { mode: "all", pinned: [] },
  };
}

export function createFullToolbarLayout(): InputToolbarLayout {
  return {
    version: 1,
    pinnedActionIds: [...INPUT_TOOLBAR_ACTION_IDS],
    quickActions: { mode: "all", pinned: [] },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function quickActionReferenceKey(ref: QuickActionReference): string {
  return JSON.stringify([ref.setId, ref.actionId]);
}

export function normalizeInputToolbarLayout(
  value: unknown,
  fallback: InputToolbarLayout = createCompactToolbarLayout()
): InputToolbarLayout {
  const source = record(value);
  const quick = record(source.quickActions);
  const ids = Array.isArray(source.pinnedActionIds)
    ? source.pinnedActionIds
    : fallback.pinnedActionIds;
  const refs = Array.isArray(quick.pinned)
    ? quick.pinned
    : fallback.quickActions.pinned;
  const seen = new Set<string>();
  const pinned: QuickActionReference[] = [];
  for (const item of refs) {
    const ref = record(item);
    if (
      typeof ref.setId !== "string" ||
      !ref.setId ||
      typeof ref.actionId !== "string" ||
      !ref.actionId
    )
      continue;
    const entry = { setId: ref.setId, actionId: ref.actionId };
    const key = quickActionReferenceKey(entry);
    if (!seen.has(key)) {
      seen.add(key);
      pinned.push(entry);
    }
  }
  return {
    version: 1,
    pinnedActionIds: [
      ...new Set(
        ids.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      ),
    ],
    quickActions: {
      mode:
        quick.mode === "all" ||
        quick.mode === "selected" ||
        quick.mode === "menu"
          ? quick.mode
          : fallback.quickActions.mode,
      pinned,
    },
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

/** Both surfaces derive from the same enabled scope, without changing source sets. */
export function partitionQuickActions(
  sets: readonly QuickActionSet[],
  layout: InputToolbarLayout
) {
  const selected = new Set(
    layout.quickActions.pinned.map(quickActionReferenceKey)
  );
  const pinned: QuickActionSet[] = [];
  const menu: QuickActionSet[] = [];
  for (const set of sets) {
    if (!set.isEnabled) continue;
    const available = set.actions.filter(
      (action) => action.isEnabled !== false
    );
    const isPinned = (actionId: string) =>
      layout.quickActions.mode === "all" ||
      (layout.quickActions.mode === "selected" &&
        selected.has(quickActionReferenceKey({ setId: set.id, actionId })));
    const pinnedActions = available.filter((action) => isPinned(action.id));
    const menuActions = available.filter((action) => !isPinned(action.id));
    if (pinnedActions.length) pinned.push({ ...set, actions: pinnedActions });
    if (menuActions.length) menu.push({ ...set, actions: menuActions });
  }
  return { pinned, menu };
}

/** Reserve the always-visible more button; widths match the toolbar's 32px buttons / 2px gap. */
export function visibleToolbarActionCount(
  width: number,
  count: number
): number {
  return Math.min(count, Math.max(0, Math.floor((width - 32) / 34)));
}
