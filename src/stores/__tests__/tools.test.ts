// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { defineComponent, markRaw } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolConfig } from "@/services/types";
import {
  DEFAULT_PINNED_QUICK_ACCESS_PATHS,
  QUICK_ACCESS_MAX_ITEMS,
  useToolsStore,
} from "../tools";

const TestIcon = markRaw(defineComponent({ template: "<span />" }));
const TestComponent = () => Promise.resolve(TestIcon);

function createTool(index: number): ToolConfig {
  return {
    name: `工具 ${index}`,
    path: `/tool-${index}`,
    icon: TestIcon,
    component: TestComponent,
    version: "1.0.0",
  };
}

function createDefaultTools(): ToolConfig[] {
  return DEFAULT_PINNED_QUICK_ACCESS_PATHS.map((path, index) => ({
    ...createTool(index + 1),
    path,
  }));
}

describe("tools store quick access", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("shows recommendations only before the user saves a preference, and preserves an explicit empty list", () => {
    const store = useToolsStore();
    store.tools.push(...createDefaultTools());
    store.initializeOrder();

    expect(store.pinnedQuickAccessTools.map((tool) => tool.path)).toEqual(
      DEFAULT_PINNED_QUICK_ACCESS_PATHS
    );
    expect(store.hasPinnedQuickAccessPreference).toBe(false);

    store.updatePinnedQuickAccess([]);

    expect(store.pinnedQuickAccessTools).toEqual([]);
    expect(store.hasPinnedQuickAccessPreference).toBe(true);
    expect(localStorage.getItem("app-pinned-quick-access")).toBe("[]");
  });

  it("pins, deduplicates, enforces the capacity, and replaces in place", () => {
    const store = useToolsStore();
    const tools = Array.from({ length: 7 }, (_, index) =>
      createTool(index + 1)
    );
    store.tools.push(...tools);
    store.updatePinnedQuickAccess([]);

    for (const tool of tools.slice(0, QUICK_ACCESS_MAX_ITEMS)) {
      expect(store.pinQuickAccess(tool.path)).toBe("success");
    }
    expect(store.pinQuickAccess(tools[0].path)).toBe("already-pinned");
    expect(store.pinQuickAccess(tools[6].path)).toBe("full");

    expect(store.replacePinnedQuickAccess(tools[2].path, tools[6].path)).toBe(
      "success"
    );
    expect(store.effectivePinnedQuickAccessPaths).toEqual([
      tools[0].path,
      tools[1].path,
      tools[6].path,
      tools[3].path,
      tools[4].path,
      tools[5].path,
    ]);
  });

  it("reorders known paths while preserving omitted entries and keeps unavailable tools recoverable", () => {
    const store = useToolsStore();
    const tools = Array.from({ length: 3 }, (_, index) =>
      createTool(index + 1)
    );
    store.tools.push(...tools);
    store.updatePinnedQuickAccess(tools.map((tool) => tool.path));

    store.reorderPinnedQuickAccess([tools[2].path, tools[0].path]);
    expect(store.effectivePinnedQuickAccessPaths).toEqual([
      tools[2].path,
      tools[0].path,
      tools[1].path,
    ]);

    store.tools.splice(1, 1);
    expect(store.pinnedQuickAccessTools.map((tool) => tool.path)).toEqual([
      tools[2].path,
      tools[0].path,
    ]);
    expect(store.effectivePinnedQuickAccessPaths).toContain(tools[1].path);

    store.tools.push(tools[1]);
    expect(store.pinnedQuickAccessTools.map((tool) => tool.path)).toEqual([
      tools[2].path,
      tools[0].path,
      tools[1].path,
    ]);
  });

  it("restores the recommended shortcuts as an explicit user preference", () => {
    const store = useToolsStore();
    store.tools.push(...createDefaultTools(), createTool(4));
    store.updatePinnedQuickAccess(["/tool-4"]);

    store.restoreDefaultPinnedQuickAccess();

    expect(store.effectivePinnedQuickAccessPaths).toEqual(
      DEFAULT_PINNED_QUICK_ACCESS_PATHS
    );
    expect(store.hasPinnedQuickAccessPreference).toBe(true);
  });
});
