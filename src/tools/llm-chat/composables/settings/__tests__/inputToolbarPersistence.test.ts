// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), error: vi.fn() }));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({ save: mocks.save }),
}));
vi.mock("@utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("@utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: mocks.error }),
}));
vi.mock("../../../config/defaultSettings", async () => {
  const { createCompactToolbarLayout } =
    await import("../../../config/inputToolbar");
  return {
    DEFAULT_SETTINGS: {
      uiPreferences: {
        fontSize: 14,
        inputToolbar: createCompactToolbarLayout(),
      },
    },
  };
});
import { useChatSettings } from "../useChatSettings";
import {
  createCompactToolbarLayout,
  createLegacyToolbarLayout,
} from "../../../config/inputToolbar";

// Protects the save boundary: a rejected disk write cannot publish the edited layout.
describe("input toolbar layout persistence", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.error.mockClear();
  });
  it("publishes a new layout only after persistence succeeds and preserves unrelated preferences", async () => {
    const chat = useChatSettings();
    const original = chat.settings.value.uiPreferences.inputToolbar;
    let finish!: () => void;
    mocks.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const layout = createLegacyToolbarLayout();
    layout.statusIds = ["input-tokens", "canvas"];
    layout.groupQuickActionsBySet = true;
    const pending = chat.saveInputToolbarLayout(layout);
    expect(chat.settings.value.uiPreferences.inputToolbar).toBe(original);
    const fontSize = chat.settings.value.uiPreferences.fontSize;
    finish();
    await pending;
    expect(chat.settings.value.uiPreferences.inputToolbar).toEqual(layout);
    expect(chat.settings.value.uiPreferences.fontSize).toBe(fontSize);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        uiPreferences: expect.objectContaining({ inputToolbar: layout }),
      })
    );
  });
  it("leaves the active layout untouched after a failed save and allows a retry", async () => {
    const chat = useChatSettings();
    const original = chat.settings.value.uiPreferences.inputToolbar;
    const edited = createCompactToolbarLayout();
    edited.pinnedActionIds = [];
    edited.statusIds = [];
    edited.groupQuickActionsBySet = true;
    mocks.save.mockRejectedValueOnce(new Error("disk full"));
    await expect(chat.saveInputToolbarLayout(edited)).rejects.toThrow(
      "disk full"
    );
    expect(chat.settings.value.uiPreferences.inputToolbar).toBe(original);
    expect(edited.statusIds).toEqual([]);
    expect(edited.groupQuickActionsBySet).toBe(true);
    expect(edited.pinnedActionIds).toEqual([]);
    mocks.save.mockResolvedValueOnce(undefined);
    await chat.saveInputToolbarLayout(edited);
    expect(
      chat.settings.value.uiPreferences.inputToolbar.pinnedActionIds
    ).toEqual([]);
    expect(chat.settings.value.uiPreferences.inputToolbar).toEqual(edited);
  });
});
