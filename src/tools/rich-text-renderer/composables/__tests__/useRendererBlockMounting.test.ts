// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import {
  createCommentVNode,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  shallowRef,
} from "vue";
import { provideRendererBlockMounting } from "../useRendererBlockMounting";
import { provideRendererReadingInteraction } from "../useRendererDisplay";
import {
  provideRendererViewState,
  rendererViewportKey,
  useRendererNodeState,
} from "../useRendererViewState";
import type { AstNode } from "../../types";

// These tests protect visible state, selection and native input ownership across disposal.
// Geometry precision and keyboard tab traversal are checked separately in native WebView2.
let wrapper: ReturnType<typeof mount> | undefined;
const visible = new Set<number>();
let resizeCallback: ResizeObserverCallback;
beforeEach(() => {
  vi.useFakeTimers();
  visible.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index = Number(this.dataset.block);
      const top =
        this.hasAttribute("data-block") && !visible.has(index) ? 2000 : 0;
      return {
        top,
        bottom: top + 100,
        left: 0,
        right: 500,
        width: 500,
        height: 100,
        x: 0,
        y: top,
        toJSON() {},
      };
    }
  );
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.getSelection()?.removeAllRanges();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function settle() {
  await nextTick();
  await vi.advanceTimersByTimeAsync(400);
  await nextTick();
}
function host(input = false) {
  const enabled = ref(false),
    live = ref(false),
    held = ref(false),
    screenshot = ref(false),
    active = ref(true);
  const nodes = shallowRef<AstNode[]>(
    Array.from({ length: 45 }, (_, index) => ({
      id: `block-${index}`,
      type: "paragraph",
      props: {},
      children: [],
      meta: { status: "stable", range: { start: index, end: index + 1 } },
    }))
  );
  const Stateful = defineComponent({
    props: {
      index: { type: Number, required: true },
      nodeId: { type: String, required: true },
    },
    setup(props) {
      const state = useRendererNodeState(() => props.nodeId, "test-disclosure");
      const count = state.ref("count", 0);
      // A fragment models code/Mermaid blocks with a primary root and a teleported viewer.
      return () => [
        h(
          "section",
          {
            "data-block": props.index,
            style: "margin-top: 8px; margin-bottom: 12px",
          },
          [
            h(
              "button",
              { onClick: () => count.value++ },
              `count ${count.value}`
            ),
            h("span", ` body ${props.index} `),
            h("button", "end"),
            input && props.index === 0
              ? h("input", { defaultValue: "initial" })
              : null,
          ]
        ),
        createCommentVNode("viewer"),
      ];
    },
  });
  const Owner = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null);
      const state = provideRendererViewState(active);
      const blocks = provideRendererBlockMounting({
        root,
        nodes,
        enabled: () => enabled.value,
        hostActive: active,
        live: () => live.value,
        held,
        layout: () => "same",
        state,
      });
      return () => {
        void blocks.revision.value;
        blocks.sync(nodes.value);
        return h(
          "article",
          { ref: root },
          nodes.value.map((node, index) =>
            blocks.render(node, () =>
              h(Stateful, { key: node.id, nodeId: node.id, index })
            )
          )
        );
      };
    },
  });
  wrapper = mount(
    defineComponent({
      setup() {
        provideRendererReadingInteraction(active);
        provide("screenshotMode", screenshot);
        const viewport = ref<HTMLElement | null>(document.body);
        provide(rendererViewportKey, viewport);
        return () => h(Owner);
      },
    }),
    { attachTo: document.body }
  );
  return {
    enabled,
    live,
    held,
    screenshot,
    active,
    nodes,
    root: () => wrapper!.get("article"),
    block: (index: number) => wrapper!.get(`[data-block="${index}"]`),
  };
}

it("restores fragment block choices after offscreen disposal while the owner remains active", async () => {
  const state = host();
  await state.block(0).get("button").trigger("click");
  state.enabled.value = true;
  await settle();
  expect(state.block(0).attributes("data-render-placeholder")).toBe("");
  expect(state.block(0).element.tagName).toBe("SECTION");
  expect((state.block(0).element as HTMLElement).style.marginTop).toBe("8px");
  expect(
    parseFloat((state.block(0).element as HTMLElement).style.height)
  ).toBeCloseTo(100, 2);
  visible.add(0);
  window.dispatchEvent(new Event("scroll"));
  await settle();
  expect(state.block(0).get("button").text()).toBe("count 1");
  await state.block(0).get("button").trigger("click");
  visible.delete(0);
  window.dispatchEvent(new Event("scroll"));
  await settle();
  state.enabled.value = false;
  await settle();
  expect(state.block(0).get("button").text()).toBe("count 2");
});

it("materializes the full selected root and preserves the exact copy text", async () => {
  const state = host();
  const select = () => {
    const range = document.createRange();
    range.selectNodeContents(state.root().element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  };
  const original = select().toString();
  document.getSelection()!.removeAllRanges();
  state.enabled.value = true;
  await settle();
  expect(state.block(0).find("button").exists()).toBe(false);
  const selection = select();
  document.dispatchEvent(new Event("selectionchange"));
  await settle();
  expect(selection.toString()).toBe(original);
  expect(state.root().findAll("button")).toHaveLength(90);
});

it("holds all blocks for streaming, screenshots and viewers and remeasures on width change", async () => {
  const state = host();
  state.enabled.value = true;
  await settle();
  for (const hold of [state.live, state.screenshot, state.held]) {
    hold.value = true;
    await settle();
    expect(state.root().findAll("button")).toHaveLength(90);
    hold.value = false;
    await settle();
    expect(state.block(0).find("button").exists()).toBe(false);
  }
  const root = state.root().element;
  resizeCallback(
    [
      {
        target: root,
        contentRect: new DOMRect(0, 0, 500, 100),
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      },
    ],
    {} as ResizeObserver
  );
  resizeCallback(
    [
      {
        target: root,
        contentRect: new DOMRect(0, 0, 420, 100),
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      },
    ],
    {} as ResizeObserver
  );
  await nextTick();
  expect(state.root().findAll("button")).toHaveLength(90);
});

it("keeps offscreen native inputs alive and cancels pending disposal on unmount", async () => {
  const state = host(true);
  const input = state.block(0).get("input").element as HTMLInputElement;
  input.value = "user choice";
  state.enabled.value = true;
  await settle();
  expect(state.block(0).get("input").element).toBe(input);
  expect(input.value).toBe("user choice");
  state.enabled.value = false;
  await nextTick();
  state.enabled.value = true;
  await nextTick();
  wrapper!.unmount();
  wrapper = undefined;
  await settle();
  expect(vi.getTimerCount()).toBe(0);
});

it("leaves ordinary rendering available when viewport observers are unavailable", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const state = host();
  state.enabled.value = true;
  await settle();
  expect(state.root().findAll("button")).toHaveLength(90);
});
