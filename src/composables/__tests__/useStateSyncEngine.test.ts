// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
const bus = vi.hoisted(() => ({
  windowType: "main",
  hasDownstreamWindows: { value: true },
  onInitialStateRequest: vi.fn(),
  onReconnect: vi.fn(),
  onWindowConnected: vi.fn(),
  onMessage: vi.fn(() => vi.fn()),
  syncState: vi.fn(),
}));
vi.mock("../useWindowSyncBus", () => ({ useWindowSyncBus: () => bus }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));
import { useStateSyncEngine } from "../useStateSyncEngine";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
// A disposed sync source must never transmit queued or explicitly requested data.
it("cancels queued transmission and rejects pushes after scope disposal", async () => {
  vi.useFakeTimers();
  const state = ref({ content: "before" });
  const scope = effectScope();
  const engine = scope.run(() =>
    useStateSyncEngine(state, {
      stateKey: "chat-current-session-data",
      autoPush: true,
      debounce: 100,
    })
  )!;
  state.value.content = "pending";
  await nextTick();
  scope.stop();
  await vi.advanceTimersByTimeAsync(200);
  await engine.manualPush();
  expect(bus.syncState).not.toHaveBeenCalled();
});

// Suspending a stream source must remove historical fields from reactive tracking.
it("skips historical traversal during streaming and captures final edits on resume", async () => {
  vi.useFakeTimers();
  let historicalReads = 0;
  const enabled = ref(true);
  const state = ref({
    history: {
      get content() {
        historicalReads++;
        return "history";
      },
    },
    active: { text: "" },
  });
  const scope = effectScope();
  scope.run(() =>
    useStateSyncEngine(state, {
      stateKey: "chat-current-session-data",
      autoPush: true,
      enableDelta: false,
      autoPushEnabled: () => enabled.value,
    })
  );
  enabled.value = false;
  await nextTick();
  historicalReads = 0;
  for (let i = 0; i < 3; i++) {
    state.value.active.text += "chunk";
    await nextTick();
  }
  await vi.advanceTimersByTimeAsync(200);
  expect(historicalReads).toBe(0);
  expect(bus.syncState).not.toHaveBeenCalled();
  enabled.value = true;
  await nextTick();
  await vi.advanceTimersByTimeAsync(200);
  expect(bus.syncState).toHaveBeenCalledTimes(1);
  expect(bus.syncState.mock.calls[0][1].active.text).toBe("chunkchunkchunk");
  scope.stop();
});
