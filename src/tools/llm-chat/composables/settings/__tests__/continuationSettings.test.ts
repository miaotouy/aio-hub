// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSettings } from "../../../types/settings";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  merge: undefined as
    | undefined
    | ((defaults: ChatSettings, loaded: Partial<ChatSettings>) => ChatSettings),
}));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: (options: { mergeConfig: typeof mocks.merge }) => {
    mocks.merge = options.mergeConfig;
    return { save: mocks.save };
  },
}));
vi.mock("@/tools/transcription/config", () => ({
  DEFAULT_TRANSCRIPTION_CONFIG: {
    image: {},
    audio: {},
    video: {},
    document: {},
  },
}));
vi.mock("@utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("@utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

import { useChatSettings } from "../useChatSettings";
import { DEFAULT_SETTINGS } from "../../../config/defaultSettings";
import { DEFAULT_CONTINUATION_SETTINGS } from "@/llm-apis/continuation";

// Protect saved user policy and compatibility with settings written before continuation preferences existed.
describe("continuation settings persistence", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.save.mockResolvedValue(undefined);
    useChatSettings().settings.value = structuredClone(DEFAULT_SETTINGS);
  });
  it("loads legacy settings with defaults and merges a partial saved continuation policy", () => {
    expect(mocks.merge!(DEFAULT_SETTINGS, {}).continuation).toEqual(
      DEFAULT_CONTINUATION_SETTINGS
    );
    const loaded = mocks.merge!(DEFAULT_SETTINGS, {
      continuation: {
        mode: "prompt",
        deduplicate: false,
      } as ChatSettings["continuation"],
    });
    expect(loaded.continuation).toEqual({
      ...DEFAULT_CONTINUATION_SETTINGS,
      mode: "prompt",
      deduplicate: false,
    });
  });
  it("persists custom continuation preferences alongside unrelated updates and restores defaults", async () => {
    const chat = useChatSettings();
    const custom = {
      ...chat.settings.value.continuation,
      mode: "prompt" as const,
      deepseekThinking: "disabled" as const,
      prompt: "继续写作。",
      tailLength: 2400,
      deduplicate: false,
    };
    await chat.updateSettings({ continuation: custom });
    await chat.updateSettings({
      requestSettings: {
        ...chat.settings.value.requestSettings,
        timeout: 90000,
      },
    });
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        continuation: custom,
        requestSettings: expect.objectContaining({ timeout: 90000 }),
      })
    );
    expect(chat.settings.value.continuation).toEqual(custom);
    await chat.resetSettings();
    expect(chat.settings.value.continuation).toEqual(
      DEFAULT_CONTINUATION_SETTINGS
    );
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ continuation: DEFAULT_CONTINUATION_SETTINGS })
    );
  });
});
