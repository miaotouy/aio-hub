// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type {
  StateSyncPayload,
  StateSyncBatchPayload,
} from "@/types/window-sync";
const mocks = vi.hoisted(() => ({ getBus: vi.fn() }));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: mocks.getBus,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
import { VersionGenerator } from "@/utils/sync-helpers";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createChatSyncConfig, CHAT_STATE_KEYS } from "../../types/sync";
import { createCompactToolbarLayout } from "../inputToolbar";

// Protects cross-window choices after a window opens between two layout saves.
// Exercises delivered state rather than checking transport flags or component structure.
describe("input toolbar window synchronization", () => {
  it("restores defaults and applies further visibility/order changes after an initial snapshot", async () => {
    // Keep transport ordering deterministic; wall-clock randomness is outside this contract.
    let version = 0;
    const versions = vi
      .spyOn(VersionGenerator, "next")
      .mockImplementation(() => ++version);
    const handlers = new Map<string, (payload: any, message: any) => void>();
    const mainBus = {
      windowType: "main",
      hasDownstreamWindows: ref(false),
      onInitialStateRequest: vi.fn(),
      onReconnect: vi.fn(),
      onMessage: vi.fn(() => () => {}),
      syncState: vi.fn(async (stateType, data, version, isFull) => {
        const payload: StateSyncPayload = {
          stateType,
          version,
          isFull,
          ...(isFull ? { data } : { patches: data }),
        };
        handlers.get("state-sync")!(JSON.parse(JSON.stringify(payload)), {});
        await nextTick();
      }),
      syncStateBatch: vi.fn(async (states: StateSyncPayload[]) => {
        handlers.get("state-sync-batch")!(
          JSON.parse(JSON.stringify({ states })) as StateSyncBatchPayload,
          {}
        );
        await nextTick();
      }),
    };
    const source = ref({
      uiPreferences: {
        inputToolbar: createCompactToolbarLayout(),
        fontSize: 14,
      },
    });
    mocks.getBus.mockReturnValue(mainBus);
    const publisher = useStateSyncEngine(
      source,
      createChatSyncConfig(CHAT_STATE_KEYS.SETTINGS)
    );
    source.value.uiPreferences.inputToolbar = {
      ...createCompactToolbarLayout(),
      statusIds: ["input-tokens", "canvas"],
      groupQuickActionsBySet: true,
    };
    await nextTick();
    await publisher.manualPush(false);

    const target = ref({
      uiPreferences: {
        inputToolbar: createCompactToolbarLayout(),
        fontSize: 14,
      },
    });
    mocks.getBus.mockReturnValue({
      windowType: "detached-component",
      onMessage: (
        type: string,
        handler: (payload: any, message: any) => void
      ) => {
        handlers.set(type, handler);
        return () => handlers.delete(type);
      },
    });
    const receiver = useStateSyncEngine(
      target,
      createChatSyncConfig(CHAT_STATE_KEYS.SETTINGS)
    );
    try {
      mainBus.hasDownstreamWindows.value = true;
      await mainBus.onInitialStateRequest.mock.calls[0][0]("detached-input");
      expect(target.value).toEqual(source.value);
      source.value.uiPreferences.inputToolbar = createCompactToolbarLayout();
      await nextTick();
      await publisher.manualPush(false);
      expect(target.value).toEqual(source.value);

      source.value.uiPreferences.inputToolbar.statusIds = [
        "canvas",
        "input-tokens",
      ];
      await nextTick();
      await publisher.manualPush(false);
      expect(target.value.uiPreferences.inputToolbar.statusIds).toEqual([
        "canvas",
        "input-tokens",
      ]);
      source.value.uiPreferences.inputToolbar.statusIds = [];
      await nextTick();
      await publisher.manualPush(false);
      expect(target.value).toEqual(source.value);
      expect(target.value.uiPreferences.inputToolbar.statusIds).toEqual([]);
    } finally {
      publisher.cleanup();
      receiver.cleanup();
      versions.mockRestore();
    }
  });
});
