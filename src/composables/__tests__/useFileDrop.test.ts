// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const bus = vi.hoisted(() => ({
  subscriptions: new Map<
    symbol,
    { event: string; callback: (event: any) => void }
  >(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, callback: (event: any) => void) => {
    const id = Symbol(event);
    bus.subscriptions.set(id, { event, callback });
    return () => {
      bus.subscriptions.delete(id);
    };
  }),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (callback: (event: any) => void) => {
      const id = Symbol("webview");
      bus.subscriptions.set(id, { event: "webview", callback });
      return () => {
        bus.subscriptions.delete(id);
      };
    },
  }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: vi.fn(), success: vi.fn() },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
import { useFileDrop } from "../useFileDrop";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  bus.subscriptions.clear();
});
function emit(event: string) {
  for (const subscription of bus.subscriptions.values()) {
    if (subscription.event === event) subscription.callback({ payload: {} });
  }
}

describe("useFileDrop listener lifecycle", () => {
  it("handles a window drag event once and releases ref-backed subscriptions on unmount", async () => {
    const onDragLeave = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          const element = ref<HTMLElement>();
          useFileDrop({ element, onDragLeave });
          return () => h("div", { ref: element });
        },
      })
    );
    wrappers.push(wrapper);
    await flushPromises();
    emit("custom-drag-leave");
    expect(onDragLeave).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(bus.subscriptions.size).toBe(0);
  });

  it("rebinds DOM events when the target element changes without duplicating window subscriptions", async () => {
    const onDragEnter = vi.fn();
    const onDragLeave = vi.fn();
    const key = ref(0);
    const wrapper = mount(
      defineComponent({
        setup() {
          const element = ref<HTMLElement>();
          useFileDrop({ element, onDragEnter, onDragLeave });
          return () => h("div", { ref: element, key: key.value });
        },
      })
    );
    wrappers.push(wrapper);
    await flushPromises();
    const oldElement = wrapper.element;
    key.value++;
    await nextTick();
    oldElement.dispatchEvent(new Event("dragenter"));
    expect(onDragEnter).not.toHaveBeenCalled();
    await wrapper.trigger("dragenter");
    expect(onDragEnter).toHaveBeenCalledOnce();
    emit("custom-drag-leave");
    expect(onDragLeave).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(bus.subscriptions.size).toBe(0);
  });
});
