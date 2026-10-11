// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { describe, expect, it } from "vitest";
import {
  createCompactToolbarLayout,
  createLegacyToolbarLayout,
  mergeInputToolbarLayout,
  normalizeInputToolbarLayout,
  partitionToolbarActions,
  partitionQuickActions,
  visibleToolbarActionCount,
} from "../inputToolbar";
import {
  resolveInputToolbarActions,
  type ToolbarActionState,
} from "../../components/message-input/toolbar/inputToolbarActions";
import type { QuickActionSet } from "../../types/quick-action";

// Protects persisted user choices, enabled action scope, and action availability contracts.
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
      quickActions: { mode: "selected", pinned: [] },
    });
    expect(mergeInputToolbarLayout(empty)).toEqual(empty);
    expect(empty.pinnedActionIds).toEqual([]);
    const changed = createCompactToolbarLayout();
    changed.pinnedActionIds.push("macro");
    expect(createCompactToolbarLayout().pinnedActionIds).toHaveLength(3);
  });

  it("repairs malformed fields while preserving unknown IDs and valid empty choices", () => {
    const layout = normalizeInputToolbarLayout({
      pinnedActionIds: ["macro", "future-action", false, "macro", "", null],
      quickActions: {
        mode: "bad-mode",
        pinned: [
          { setId: "s", actionId: "a" },
          { setId: "s", actionId: "a" },
          { setId: 0, actionId: "a" },
        ],
      },
    });
    expect(layout.pinnedActionIds).toEqual(["macro", "future-action"]);
    expect(layout.quickActions).toEqual({
      mode: "menu",
      pinned: [{ setId: "s", actionId: "a" }],
    });
    expect(normalizeInputToolbarLayout(null)).toEqual(
      createCompactToolbarLayout()
    );
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

  it("scopes selected shortcuts by both set and action, excludes disabled entries and never edits source groups", () => {
    const set = (id: string, enabled = true): QuickActionSet => ({
      id,
      name: id,
      isEnabled: enabled,
      updatedAt: "",
      actions: [
        {
          id: "shared",
          label: "action",
          content: "{{input}}",
          autoSend: false,
        },
        {
          id: "disabled",
          label: "off",
          content: "",
          autoSend: false,
          isEnabled: false,
        },
      ],
    });
    const sets = [set("one"), set("two"), set("off", false)];
    const original = JSON.stringify(sets);
    const layout = normalizeInputToolbarLayout({
      pinnedActionIds: [],
      quickActions: {
        mode: "selected",
        pinned: [
          { setId: "one", actionId: "shared" },
          { setId: "inactive", actionId: "shared" },
        ],
      },
    });
    const selected = partitionQuickActions(sets, layout);
    expect(
      selected.pinned.map((group) => [
        group.id,
        group.actions.map((action) => action.id),
      ])
    ).toEqual([["one", ["shared"]]]);
    expect(
      selected.menu.map((group) => [
        group.id,
        group.actions.map((action) => action.id),
      ])
    ).toEqual([["two", ["shared"]]]);
    expect(
      partitionQuickActions(sets, {
        ...layout,
        quickActions: { ...layout.quickActions, mode: "all" },
      }).pinned
    ).toHaveLength(2);
    expect(
      partitionQuickActions(sets, {
        ...layout,
        quickActions: { ...layout.quickActions, mode: "menu" },
      }).menu
    ).toHaveLength(2);
    expect(
      partitionQuickActions([set("inactive")], layout).pinned.map(
        (group) => group.id
      )
    ).toEqual(["inactive"]);
    expect(JSON.stringify(sets)).toBe(original);
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
