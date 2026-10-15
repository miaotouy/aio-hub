// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { describe, expect, it } from "vitest";
import {
  createCompactToolbarLayout,
  createLegacyToolbarLayout,
  mergeInputToolbarLayout,
  normalizeInputToolbarLayout,
  partitionToolbarActions,
  visibleToolbarActionCount,
  reorderToolbarIds,
} from "../inputToolbar";
import {
  resolveInputToolbarActions,
  type ToolbarActionState,
} from "../../components/message-input/toolbar/inputToolbarActions";

// Protects persisted user choices and action availability contracts.
// Assertions intentionally ignore component structure and visible wording.
describe("input toolbar user layout", () => {
  it("uses compact defaults for fresh configs and preserves existing layouts during upgrade", () => {
    expect(createCompactToolbarLayout().pinnedActionIds).toEqual([
      "attachment",
      "temporary-model",
      "knowledge",
    ]);
    expect(mergeInputToolbarLayout(undefined)).toEqual(
      createLegacyToolbarLayout()
    );
    const empty = normalizeInputToolbarLayout({
      pinnedActionIds: [],
    });
    expect(mergeInputToolbarLayout(empty)).toEqual(empty);
    expect(empty.pinnedActionIds).toEqual([]);
    const changed = createCompactToolbarLayout();
    changed.pinnedActionIds.push("macro");
    expect(createCompactToolbarLayout().pinnedActionIds).toHaveLength(3);
  });

  it("preserves system choices when migrating saved shortcut layout preferences", () => {
    const layout = normalizeInputToolbarLayout({
      pinnedActionIds: ["macro", "future-action", false, "macro", "", null],
      quickActions: {
        mode: "menu",
        pinned: [
          { setId: "s", actionId: "a" },
          { setId: "s", actionId: "a" },
          { setId: 0, actionId: "a" },
        ],
      },
    });
    expect(layout.pinnedActionIds).toEqual(["macro", "future-action"]);
    expect(layout).toEqual({
      ...createCompactToolbarLayout(),
      pinnedActionIds: ["macro", "future-action"],
    });
    expect(normalizeInputToolbarLayout(null)).toEqual(
      createCompactToolbarLayout()
    );
  });

  // Upgrade must preserve the user's visible statistics and grouped shortcuts.
  it("migrates input display preferences while preserving the saved action order", () => {
    const layout = mergeInputToolbarLayout(
      { pinnedActionIds: ["macro", "attachment"] },
      {
        showTokenUsage: false,
        groupQuickActionsBySet: true,
      }
    );
    expect(layout.pinnedActionIds).toEqual(["macro", "attachment"]);
    expect(layout.statusIds).toEqual([
      "continuation-model",
      "temporary-model",
      "canvas",
    ]);
    expect(layout.groupQuickActionsBySet).toBe(true);
    expect(
      mergeInputToolbarLayout(undefined, { showTokenUsage: false }).statusIds
    ).toEqual(layout.statusIds);
    expect(
      mergeInputToolbarLayout({ pinnedActionIds: [] }, { showTokenUsage: true })
        .statusIds
    ).toContain("input-tokens");
  });

  it("honors explicit status choices over legacy settings, including an empty status area", () => {
    const saved = {
      pinnedActionIds: [],
      statusIds: [
        "input-tokens",
        "canvas",
        "future-status",
        "input-tokens",
        null,
        "",
      ],
      groupQuickActionsBySet: false,
    };
    const layout = mergeInputToolbarLayout(saved, {
      showTokenUsage: false,
      groupQuickActionsBySet: true,
    });
    expect(layout.statusIds).toEqual([
      "input-tokens",
      "canvas",
      "future-status",
    ]);
    expect(layout.groupQuickActionsBySet).toBe(false);
    expect(layout.pinnedActionIds).toEqual([]);
    expect(
      mergeInputToolbarLayout(
        { ...saved, statusIds: [] },
        { showTokenUsage: true }
      ).statusIds
    ).toEqual([]);
    const second = normalizeInputToolbarLayout(layout);
    second.statusIds.reverse();
    expect(layout.statusIds).toEqual([
      "input-tokens",
      "canvas",
      "future-status",
    ]);
  });

  it("falls back safely for malformed status preferences without losing valid choices", () => {
    const fallback = mergeInputToolbarLayout(undefined, {
      showTokenUsage: false,
      groupQuickActionsBySet: true,
    });
    const layout = normalizeInputToolbarLayout(
      { statusIds: "canvas", groupQuickActionsBySet: "false" },
      fallback
    );
    expect(layout.statusIds).toEqual(fallback.statusIds);
    expect(layout.groupQuickActionsBySet).toBe(true);
    expect(
      normalizeInputToolbarLayout({ statusIds: ["context-tokens"] }).statusIds
    ).toEqual(["context-tokens"]);
  });

  it("keeps one location per available action, honors custom order and restores temporarily unavailable pins", () => {
    const saved = [
      "macro",
      "future-action",
      "attachment",
      "macro",
      "translate",
    ];
    const available = [
      { id: "attachment" },
      { id: "macro" },
      { id: "translate", visible: false },
      { id: "compress" },
    ];
    expect(partitionToolbarActions(available, saved)).toEqual({
      pinned: [available[1], available[0]],
      menu: [available[3]],
    });
    const restored = [
      ...available.slice(0, 2),
      { id: "translate", visible: true },
      available[3],
    ];
    expect(
      partitionToolbarActions(restored, saved).pinned.map((action) => action.id)
    ).toEqual(["macro", "attachment", "translate"]);
    expect(saved).toEqual([
      "macro",
      "future-action",
      "attachment",
      "macro",
      "translate",
    ]);
  });

  // Search and unknown-version IDs must keep their saved positions during visible-only sorting.
  it("reorders visible actions and statuses without moving filtered or unknown IDs", () => {
    const ids = ["attachment", "future-action", "macro", "knowledge"];
    expect(reorderToolbarIds(ids, ["knowledge", "attachment"])).toEqual([
      "knowledge",
      "future-action",
      "macro",
      "attachment",
    ]);
    expect(ids).toEqual(["attachment", "future-action", "macro", "knowledge"]);
    expect(
      reorderToolbarIds(
        ["canvas", "future-status", "input-tokens"],
        ["input-tokens", "canvas"]
      )
    ).toEqual(["input-tokens", "future-status", "canvas"]);
    expect(reorderToolbarIds(ids, [])).toEqual(ids);
  });

  it("reserves access to more actions and restores pins as the window expands", () => {
    expect(visibleToolbarActionCount(32, 7)).toBe(0);
    expect(visibleToolbarActionCount(100, 7)).toBe(2);
    expect(visibleToolbarActionCount(236, 7)).toBe(6);
    expect(visibleToolbarActionCount(400, 7)).toBe(7);
  });
});

const state: ToolbarActionState = {
  disabled: false,
  hasAgent: true,
  hasText: true,
  hasAttachments: false,
  isSending: false,
  isCompleting: false,
  isTranslating: false,
  isCompressing: false,
  translationEnabled: true,
  compressionEnabled: true,
  isDetached: false,
  isExpanded: false,
  isStreamingEnabled: true,
  isInputHeightLocked: false,
  hasClipboardDraft: false,
  toolCallingEnabled: true,
  isVcpChannel: false,
  knowledgeCount: 0,
};
function action(id: string, patch: Partial<ToolbarActionState> = {}) {
  return resolveInputToolbarActions({ ...state, ...patch }).find(
    (item) => item.id === id
  )!;
}
describe("input toolbar operation availability", () => {
  it("preserves generation, draft, text and compression preconditions regardless of placement", () => {
    expect(action("complete").disabled).toBe(false);
    expect(action("complete", { isSending: true }).disabled).toBe(true);
    expect(action("continuation-model", { isCompleting: true }).disabled).toBe(
      true
    );
    expect(action("translate", { hasText: false }).disabled).toBe(true);
    expect(action("compress", { compressionEnabled: false }).disabled).toBe(
      true
    );
    expect(
      action("cut-draft", { hasText: false, hasAttachments: true }).disabled
    ).toBe(false);
    expect(
      action("cut-draft", { hasText: false, hasAttachments: false }).disabled
    ).toBe(true);
    expect(action("paste-draft").disabled).toBe(true);
    expect(action("paste-draft", { hasClipboardDraft: true }).disabled).toBe(
      false
    );
    expect(action("convert-paths", { disabled: true }).disabled).toBe(true);
  });
  it("distinguishes enabled feature state from an opened selector and respects feature/window scope", () => {
    expect(action("tool-settings").active).toBe(true);
    expect(action("tool-settings").expanded).toBe(false);
    expect(
      action("tool-settings", { openPanel: "tool-settings" }).expanded
    ).toBe(true);
    expect(action("knowledge", { hasAgent: false }).disabled).toBe(true);
    expect(action("translate", { translationEnabled: false }).visible).toBe(
      false
    );
    expect(action("expand", { isDetached: true }).visible).toBe(false);
  });
});
