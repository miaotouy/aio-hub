// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BaseMessage } from "@/types/window-sync";

const host = vi.hoisted(() => ({
  label: "main",
  listeners: new Map<string, (event: { payload: BaseMessage }) => void>(),
}));
vi.mock("@/platform/native/events", () => ({
  listen: vi.fn(
    async (
      _event: string,
      callback: (event: { payload: BaseMessage }) => void
    ) => {
      const label = host.label;
      host.listeners.set(label, callback);
      return () => host.listeners.delete(label);
    }
  ),
  emit: vi.fn(async (_event: string, payload: BaseMessage) => {
    for (const callback of host.listeners.values()) callback({ payload });
  }),
}));
vi.mock("@/platform/native/webview-window", () => ({
  getCurrentWebviewWindow: () => ({
    label: host.label,
    onFocusChanged: async () => () => {},
  }),
  getAllWebviewWindows: async () =>
    [...host.listeners.keys()].map((label) => ({
      label,
      emit: async (_event: string, payload: BaseMessage) =>
        host.listeners.get(label)?.({ payload }),
    })),
}));
vi.mock("@/utils/singleton", () => ({
  getOrCreateInstance: (_key: string, factory: () => unknown) => factory(),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("@/services/executor", () => ({ execute: vi.fn() }));

import { useWindowSyncBus } from "./useWindowSyncBus";

const buses: ReturnType<typeof useWindowSyncBus>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  host.listeners.clear();
});
afterEach(() => {
  for (const bus of buses.splice(0)) bus.cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function windowBus(label: string) {
  host.label = label;
  const bus = useWindowSyncBus();
  buses.push(bus);
  await bus.initializeSyncBus({ enableHeartbeat: false });
  return bus;
}

it.each([false, true])(
  "routes a broadcast to its owner despite a third window without the action handler (owner fails: %s)",
  async (failure) => {
    const owner = await windowBus("main");
    let complete!: () => void;
    const ready = new Promise<void>((resolve) => {
      complete = resolve;
    });
    owner.onActionRequest("drafts", async () => {
      await ready;
      if (failure) throw new Error("disk full");
      return { saved: true };
    });
    await windowBus("detached-chat");
    const requester = await windowBus("detached-input");
    const result = requester.requestAction("drafts:save", {});
    const assertion = failure
      ? expect(result).rejects.toThrow("disk full")
      : expect(result).resolves.toEqual({ saved: true });
    complete();
    await assertion;
  }
);

it("returns an actionable error for a directly addressed request with no handler", async () => {
  await windowBus("main");
  const response = vi.fn();
  host.listeners.set("sender", response);
  host.listeners.get("main")!({
    payload: {
      type: "action-request",
      from: "sender",
      to: "main",
      timestamp: Date.now(),
      id: "direct",
      payload: { action: "missing:save", params: {}, requestId: "request-1" },
    } as BaseMessage,
  });
  await vi.waitFor(() => expect(response).toHaveBeenCalled());
  expect(response.mock.calls[0][0].payload).toMatchObject({
    type: "action-response",
    to: "sender",
    payload: {
      requestId: "request-1",
      success: false,
      error: expect.stringContaining("missing:save"),
    },
  });
});
