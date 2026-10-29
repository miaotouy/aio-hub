// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, provide, nextTick } from "vue";
import {
  provideRendererLayoutState,
  useRendererLayoutTask,
} from "../useRendererLayoutState";
import {
  useRendererDisplay,
  rendererReadingScopeKey,
} from "../useRendererDisplay";
import type { AstNode } from "../../types";

// Protect ownership across superseded async responses and display-tree removal.
it("ignores obsolete settlement and releases pending layout when its owner is removed", () => {
  let state!: ReturnType<typeof provideRendererLayoutState>;
  let task!: ReturnType<typeof useRendererLayoutTask>;
  const Child = defineComponent({
    setup() {
      task = useRendererLayoutTask(() => "formula");
      return () => h("span");
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        state = provideRendererLayoutState();
        return () => h(Child);
      },
    })
  );
  try {
    const block = { id: "paragraph", children: [{ id: "formula" }] } as AstNode;
    const old = task.begin();
    const current = task.begin();
    old();
    expect(state.pending.value).toBe(true);
    expect(state.hasPending(block)).toBe(true);
    current();
    expect(state.pending.value).toBe(false);
    task.begin();
  } finally {
    wrapper.unmount();
  }
  expect(state.pending.value).toBe(false);
});

it("retains measured geometry while layout is pending and recycles after the final measurement", async () => {
  vi.useFakeTimers();
  let resize!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const pending = ref(false);
  const Owner = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null);
      const display = useRendererDisplay({
        root,
        hostActive: ref(true),
        enabled: () => true,
        live: () => false,
        held: ref(false),
        pending,
        revision: () => "same",
      });
      return () =>
        h(
          "section",
          { ref: root, style: display.style.value },
          display.active.value ? [h("p", "body")] : []
        );
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        provide(rendererReadingScopeKey, ref(false));
        return () => h(Owner);
      },
    })
  );
  const measure = (height: number) =>
    resize(
      [
        {
          target: wrapper.element,
          contentRect: { width: 600, height },
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver
    );
  try {
    await nextTick();
    measure(320);
    pending.value = true;
    await nextTick();
    measure(48);
    await vi.advanceTimersByTimeAsync(350);
    expect(wrapper.find("p").exists()).toBe(true);
    pending.value = false;
    await nextTick();
    measure(320);
    await vi.advanceTimersByTimeAsync(350);
    expect(wrapper.find("p").exists()).toBe(false);
    expect((wrapper.element as HTMLElement).style.height).toBe("320px");
  } finally {
    wrapper.unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
