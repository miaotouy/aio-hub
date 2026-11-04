// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const bus = vi.hoisted(() => ({
  electron: false,
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
vi.mock("@/platform/core/env", () => ({
  isElectronRuntime: () => bus.electron,
}));
vi.mock("@/platform/native/events", () => ({
  listen: (event: string, callback: (event: any) => void) =>
    bus.subscribe(event, callback),
}));
vi.mock("@/platform/native/webview", () => ({
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
import { invoke } from "@/platform/native/core";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  bus.electron = false;
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

function nativeDrop(
  position: { x: number; y: number },
  paths = ["C:/work/file.txt"]
) {
  for (const sub of bus.subscriptions.values())
    if (sub.event === "webview")
      sub.callback({ payload: { type: "drop", position, paths } });
}
function fileDrop(element: Element) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { files: [new File(["hello"], "file.txt")], getData: () => "" },
  });
  element.dispatchEvent(event);
}
describe("Electron file-drop fusion", () => {
  it("routes to the correct zone once while allowing a later drop of the same file", async () => {
    bus.electron = true;
    const left = vi.fn(),
      right = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          const a = ref<HTMLElement>(),
            b = ref<HTMLElement>();
          useFileDrop({ element: a, onDrop: left, silent: true });
          useFileDrop({ element: b, onDrop: right, silent: true });
          return () =>
            h("div", [
              h("div", { ref: a, id: "a" }),
              h("div", { ref: b, id: "b" }),
            ]);
        },
      })
    );
    wrappers.push(wrapper);
    await flushPromises();
    await vi.waitFor(() =>
      expect(
        [...bus.subscriptions.values()].filter((sub) => sub.event === "webview")
      ).toHaveLength(2)
    );
    const a = wrapper.get("#a"),
      b = wrapper.get("#b");
    vi.spyOn(a.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
    } as DOMRect);
    vi.spyOn(b.element, "getBoundingClientRect").mockReturnValue({
      left: 200,
      top: 0,
      right: 300,
      bottom: 100,
    } as DOMRect);
    for (let i = 0; i < 2; i++) {
      nativeDrop({ x: 250, y: 50 });
      fileDrop(b.element);
      await flushPromises();
    }
    expect(left).not.toHaveBeenCalled();
    expect(right.mock.calls).toEqual([
      [["C:/work/file.txt"]],
      [["C:/work/file.txt"]],
    ]);
    expect(
      [...bus.subscriptions.values()].every((sub) => sub.event === "webview")
    ).toBe(true);
  });
  it("lets the H5 File consumer own the drop without a second path import", async () => {
    bus.electron = true;
    const paths = vi.fn(),
      files = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          const element = ref<HTMLElement>();
          useFileDrop({ element, onDrop: paths, onFiles: files, silent: true });
          return () => h("div", { ref: element });
        },
      })
    );
    wrappers.push(wrapper);
    await flushPromises();
    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
    } as DOMRect);
    nativeDrop({ x: 50, y: 50 });
    fileDrop(wrapper.element);
    await flushPromises();
    expect(paths).not.toHaveBeenCalled();
    expect(files).toHaveBeenCalledOnce();
    expect(files.mock.calls[0][0][0].name).toBe("file.txt");
  });
});

describe("Electron path preference", () => {
  it.each([{ preferFileObjects: false }, { directoryOnly: true }])(
    "keeps explicit path consumers working with %j",
    async (selection) => {
      bus.electron = true;
      const paths = vi.fn(),
        files = vi.fn();
      const wrapper = mount(
        defineComponent({
          setup() {
            const element = ref<HTMLElement>();
            useFileDrop({
              element,
              onDrop: paths,
              onFiles: files,
              silent: true,
              ...selection,
            });
            return () => h("div", { ref: element });
          },
        })
      );
      wrappers.push(wrapper);
      await flushPromises();
      vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      } as DOMRect);
      if ("directoryOnly" in selection)
        vi.mocked(invoke).mockResolvedValueOnce(true);
      nativeDrop({ x: 50, y: 50 });
      fileDrop(wrapper.element);
      await flushPromises();
      expect(paths).toHaveBeenCalledWith(["C:/work/file.txt"]);
      expect(files).not.toHaveBeenCalled();
    }
  );
});
