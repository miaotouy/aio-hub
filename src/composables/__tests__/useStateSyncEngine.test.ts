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
