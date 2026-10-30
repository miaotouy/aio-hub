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
  deferredEvent: null as string | null,
  pending: [] as { resolve: () => void; reject: (error: Error) => void }[],
  async subscribe(event: string, callback: (event: any) => void) {
    if (this.deferredEvent === event) {
      this.deferredEvent = null;
      await new Promise<void>((resolve, reject) => {
        this.pending.push({ resolve, reject });
      });
    }
    const id = Symbol(event);
    this.subscriptions.set(id, { event, callback });
    return () => {
      this.subscriptions.delete(id);
    };
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, callback: (event: any) => void) =>
    bus.subscribe(event, callback),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (callback: (event: any) => void) =>
      bus.subscribe("webview", callback),
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
  bus.deferredEvent = null;
  bus.pending.length = 0;
});
function emit(event: string) {
  for (const subscription of bus.subscriptions.values()) {
    if (subscription.event === event) subscription.callback({ payload: {} });
  }
}
function selectorDrop(onDragLeave = vi.fn()) {
  let drop!: ReturnType<typeof useFileDrop>;
  const wrapper = mount(
    defineComponent({
      setup() {
        drop = useFileDrop({ element: "#drop", onDragLeave });
        return () => h("div", { id: "drop" });
      },
    }),
    { attachTo: document.body }
  );
  wrappers.push(wrapper);
  return { wrapper, drop, onDragLeave };
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

  // 覆盖首个自定义订阅和最后的 WebView 订阅这两类异步入口。
  it.each(["custom-drag-enter", "webview"])(
    "releases a late %s registration after unmount",
    async (event) => {
      bus.deferredEvent = event;
      const { wrapper, drop } = selectorDrop();
      await flushPromises();
      expect(bus.pending).toHaveLength(1);
      wrapper.unmount();
      bus.pending.shift()!.resolve();
      await flushPromises();
      expect(bus.subscriptions.size).toBe(0);
      await drop.reinitialize();
      expect(bus.subscriptions.size).toBe(0);
    }
  );

  it("keeps the new batch live when an older initialization completes late", async () => {
    bus.deferredEvent = "custom-drag-enter";
    const { wrapper, drop, onDragLeave } = selectorDrop();
    await flushPromises();
    expect(bus.pending).toHaveLength(1);
    await drop.reinitialize();
    bus.pending.shift()!.resolve();
    await flushPromises();
    emit("custom-drag-leave");
    expect(onDragLeave).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(bus.subscriptions.size).toBe(0);
  });

  it("releases a partially registered batch on failure and can initialize again", async () => {
    bus.deferredEvent = "custom-drag-over";
    const { wrapper, drop, onDragLeave } = selectorDrop();
    await flushPromises();
    expect(bus.pending).toHaveLength(1);
    expect(bus.subscriptions.size).toBeGreaterThan(0);
    bus.pending.shift()!.reject(new Error("subscription failed"));
    await flushPromises();
    expect(bus.subscriptions.size).toBe(0);
    await wrapper.trigger("dragenter");
    expect(drop.isDraggingOver.value).toBe(true);
    await drop.reinitialize();
    onDragLeave.mockClear();
    emit("custom-drag-leave");
    expect(onDragLeave).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(bus.subscriptions.size).toBe(0);
  });
});
