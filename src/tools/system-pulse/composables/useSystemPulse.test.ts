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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, ref, type Component } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { invoke } from "@/platform/native/core";
import { listen } from "@/platform/native/events";
import { useSystemPulse } from "./useSystemPulse";
vi.mock("@/platform/native/events", () => ({ listen: vi.fn() }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ error: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
const store = vi.hoisted(() => ({
  latest: null,
  fullHistoryArray: [],
  applySnapshot: vi.fn(),
}));
vi.mock("../store/useSystemPulseStore", () => ({
  useSystemPulseStore: () => store,
}));
type Listener = {
  event: string;
  callback: (event: any) => void;
  dispose: ReturnType<typeof vi.fn>;
};
let listeners: Listener[],
  wrapper: VueWrapper | undefined,
  logic: ReturnType<typeof useSystemPulse>;
const showing = ref(true);
const Page: Component = defineComponent({
  setup() {
    logic = useSystemPulse();
    return () => h("div");
  },
});
const Other = defineComponent({ setup: () => () => h("aside") });
function open() {
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(KeepAlive, {}, () => h(showing.value ? Page : Other)),
    })
  );
}
const starts = () =>
  vi.mocked(invoke).mock.calls.filter((call) => call[0] === "start_pulse");
const stops = () =>
  vi.mocked(invoke).mock.calls.filter((call) => call[0] === "stop_pulse");
beforeEach(() => {
  showing.value = true;
  listeners = [];
  store.applySnapshot.mockClear();
  vi.mocked(invoke).mockReset().mockResolvedValue(null);
  vi.mocked(listen)
    .mockReset()
    .mockImplementation(async (event, callback) => {
      const listener = { event, callback, dispose: vi.fn() };
      listeners.push(listener);
      return listener.dispose;
    });
});
afterEach(async () => {
  wrapper?.unmount();
  wrapper = undefined;
  await flushPromises();
});
describe("system pulse cached-page lifecycle", () => {
  it("starts once on mount/activation, pauses on navigation, and preserves manual pause", async () => {
    open();
    await flushPromises();
    expect(starts()).toHaveLength(1);
    expect(logic.isActive.value).toBe(true);
    showing.value = false;
    await flushPromises();
    expect(stops()).toHaveLength(1);
    showing.value = true;
    await flushPromises();
    expect(starts()).toHaveLength(2);
    await logic.stop();
    expect(stops()).toHaveLength(2);
    showing.value = false;
    await flushPromises();
    showing.value = true;
    await flushPromises();
    expect(starts()).toHaveLength(2);
    expect(logic.isActive.value).toBe(false);
    expect(
      listeners.every((listener) => listener.dispose.mock.calls.length === 1)
    ).toBe(true);
  });
  it("cleans a listener that finishes registering after unmount", async () => {
    let finish!: (dispose: () => void) => void;
    vi.mocked(listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    open();
    await flushPromises();
    wrapper!.unmount();
    wrapper = undefined;
    const dispose = vi.fn();
    finish(dispose);
    await flushPromises();
    expect(dispose).toHaveBeenCalledOnce();
    expect(starts()).toHaveLength(0);
  });
  it("stops a pending start and ignores late snapshots after pause", async () => {
    let finish!: (value: null) => void;
    vi.mocked(invoke).mockImplementation((command) =>
      command === "start_pulse"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(null)
    );
    open();
    await flushPromises();
    const stopped = logic.stop();
    listeners[0].callback({ payload: { timestamp: 1 } });
    expect(store.applySnapshot).not.toHaveBeenCalled();
    finish(null);
    await stopped;
    expect(logic.isActive.value).toBe(false);
    expect(stops()).toHaveLength(1);
    expect(
      listeners.every((listener) => listener.dispose.mock.calls.length === 1)
    ).toBe(true);
  });
  it("filters stale subscriptions and recovers from native failure through retry", async () => {
    open();
    await flushPromises();
    const id = (starts()[0][1] as any).subscriptionId;
    listeners[0].callback({
      payload: { timestamp: 1, subscriptionId: "stale" },
    });
    expect(store.applySnapshot).not.toHaveBeenCalled();
    listeners[0].callback({ payload: { timestamp: 2, subscriptionId: id } });
    expect(store.applySnapshot).toHaveBeenCalledOnce();
    listeners[1].callback({
      payload: { subscriptionId: id, message: "采集失败" },
    });
    await flushPromises();
    expect(logic.isActive.value).toBe(false);
    expect(logic.errorMessage.value).toBeTruthy();
    await logic.start();
    expect(logic.isActive.value).toBe(true);
    expect(logic.errorMessage.value).toBe("");
    listeners[0].callback({ payload: { timestamp: 3, subscriptionId: id } });
    expect(store.applySnapshot).toHaveBeenCalledOnce();
  });
  it("releases listeners when the start command fails and allows retry", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(Error("采集器加载失败"));
    open();
    await flushPromises();
    expect(logic.errorMessage.value).toBeTruthy();
    expect(
      listeners.every((listener) => listener.dispose.mock.calls.length === 1)
    ).toBe(true);
    await logic.start();
    expect(starts()).toHaveLength(2);
    expect(logic.isActive.value).toBe(true);
  });
});
