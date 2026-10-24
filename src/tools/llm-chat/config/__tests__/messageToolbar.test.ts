// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { describe, expect, it } from "vitest";
import {
  createDefaultMessageToolbarLayout,
  normalizeMessageToolbarLayout,
} from "../messageToolbar";
import { partitionToolbarActions } from "../inputToolbar";
import {
  resolveMessageToolbarActions,
  type MessageToolbarState,
} from "../../components/message/messageToolbarActions";

const base: MessageToolbarState = {
  role: "assistant",
  generating: false,
  preset: false,
  disabled: false,
  copied: false,
  translationEnabled: true,
  translationVisible: false,
  hasVariables: true,
  variablesChanged: false,
  buttons: {
    copy: true,
    edit: true,
    createBranch: true,
    delete: true,
    regenerate: true,
    toggleEnabled: true,
    abort: true,
    analyzeContext: true,
    exportBranch: true,
    moreMenu: true,
    translate: true,
  },
};

// 保护持久化布局和消息状态约束；操作位置与组件结构无关。
describe("message toolbar user preferences", () => {
  it("normalizes old or malformed settings while preserving empty layouts and future IDs", () => {
    expect(normalizeMessageToolbarLayout(undefined)).toEqual(
      createDefaultMessageToolbarLayout()
    );
    expect(
      normalizeMessageToolbarLayout({ pinnedActionIds: [], expanded: true })
    ).toEqual({ version: 1, pinnedActionIds: [], expanded: true });
    expect(
      normalizeMessageToolbarLayout({
        pinnedActionIds: ["edit", false, "future-action", "edit", "", " "],
        expanded: "yes",
      })
    ).toEqual({
      version: 1,
      pinnedActionIds: ["edit", "future-action"],
      expanded: false,
    });
    const changed = createDefaultMessageToolbarLayout();
    changed.pinnedActionIds.push("delete");
    expect(createDefaultMessageToolbarLayout().pinnedActionIds).toEqual([
      "copy",
      "edit",
      "regenerate",
    ]);
  });

  it("keeps the chosen order and moves every other available action into the menu exactly once", () => {
    const actions = resolveMessageToolbarActions({
      ...base,
      translationEnabled: false,
    });
    const { pinned, menu } = partitionToolbarActions(actions, [
      "edit",
      "translate",
      "future-action",
      "copy",
      "edit",
    ]);
    expect(pinned.map((action) => action.id)).toEqual(["edit", "copy"]);
    expect(menu.map((action) => action.id)).toContain("delete");
    expect([...pinned, ...menu].map((action) => action.id).sort()).toEqual(
      actions.map((action) => action.id).sort()
    );
    expect(partitionToolbarActions(actions, []).menu).toEqual(actions);
  });

  it("withholds destructive and editing actions during generation while preserving parallel regeneration", () => {
    const actions = resolveMessageToolbarActions({ ...base, generating: true });
    const ids = actions.map((action) => action.id);
    expect(ids).toEqual(
      expect.arrayContaining(["copy", "regenerate", "regenerate-model"])
    );
    for (const id of [
      "edit",
      "delete",
      "create-branch",
      "toggle-enabled",
      "translate",
      "continue",
      "continue-model",
      "recalculate-tokens",
      "reparse-tools",
      "edit-data",
    ])
      expect(ids).not.toContain(id);
  });

  it("keeps preset restrictions and caller visibility rules after pinning", () => {
    const preset = resolveMessageToolbarActions({ ...base, preset: true });
    const { pinned } = partitionToolbarActions(preset, [
      "delete",
      "create-branch",
      "regenerate",
      "edit",
    ]);
    expect(pinned.map((action) => [action.id, !!action.disabled])).toEqual([
      ["delete", true],
      ["create-branch", true],
      ["regenerate", true],
      ["edit", false],
    ]);
    expect(preset.map((action) => action.id)).not.toContain("edit-data");
    const restricted = resolveMessageToolbarActions({
      ...base,
      buttons: { copy: true, moreMenu: false },
    });
    expect(
      partitionToolbarActions(restricted, [
        "delete",
        "screenshot",
        "copy",
      ]).pinned.map((action) => action.id)
    ).toEqual(["copy"]);
    expect(restricted.map((action) => action.id)).toEqual([
      "copy",
      "variables",
    ]);
  });
});
