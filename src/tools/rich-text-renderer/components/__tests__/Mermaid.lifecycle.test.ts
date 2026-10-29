// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick, provide, ref, type Ref } from "vue";
import {
  provideRendererViewState,
  rendererViewportKey,
} from "../../composables/useRendererViewState";
import { RICH_TEXT_CONTEXT_KEY } from "../../types";
import MermaidNode from "../nodes/MermaidNode.vue";
import MermaidInteractiveViewer from "../MermaidInteractiveViewer.vue";

const state = vi.hoisted(() => ({
  dark: undefined as unknown as Ref<boolean>,
  theme: "",
  render: vi.fn(),
}));
vi.mock("@composables/useTheme", () => ({
  useTheme: () => ({ isDark: state.dark }),
}));
vi.mock("mermaid", () => ({
  default: {
    initialize: (config: { theme: string }) => {
      state.theme = config.theme;
    },
    render: state.render,
  },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  ErrorLevel: { WARNING: "warning" },
  createModuleErrorHandler: () => ({ handle: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(() => {
  state.dark = ref(false);
  state.render.mockReset();
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Both public consumers must reject obsolete SVG, use the latest theme, and survive remount.
it.each(["node", "viewer"] as const)(
  "%s ignores old renders and restores output with the current theme",
  async (kind) => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    let finish!: (result: { svg: string }) => void;
    state.render
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockImplementation(async (_id, content) => ({
        svg: "<svg><text>" + state.theme + ":" + content + "</text></svg>",
      }));
    const mountView = (content: string) => {
      const wrapper =
        kind === "node"
          ? mount(MermaidNode, {
              props: { nodeId: "same-message-node", content },
            })
          : mount(MermaidInteractiveViewer, { props: { content } });
      wrappers.push(wrapper);
      return wrapper;
    };
    const wrapper = mountView("graph TD; A-->Old");
    await flushPromises();
    expect(finish).toBeTypeOf("function");
    await wrapper.setProps({ content: "graph TD; A-->Latest" });
    state.dark.value = true;
    await flushPromises();
    finish({ svg: "<svg><text>obsolete</text></svg>" });
    await flushPromises();
    expect(wrapper.find("svg text").text()).toContain(
      "dark:graph TD; A-->Latest"
    );
    expect(wrapper.text()).not.toContain("obsolete");
    wrapper.unmount();
    const restored = mountView("graph TD; A-->Restored");
    await flushPromises();
    expect(restored.find("svg text").text()).toContain(
      "dark:graph TD; A-->Restored"
    );
    state.dark.value = false;
    await flushPromises();
    expect(restored.find("svg text").text()).toContain(
      "default:graph TD; A-->Restored"
    );
  }
);

// The host keeps scalar view state across display-tree removal, as in the chat renderer.
function restoredDiagram() {
  const visibility = new Map<Element, IntersectionObserverCallback>();
  // A skipped content-visibility subtree can have measurable geometry while RO stays silent.
  const top = ref(2000);
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("mermaid-container")
        ? new DOMRect(0, top.value, 600, 240)
        : this.classList.contains("test-viewport")
          ? new DOMRect(0, 80, 600, 300)
          : originalRect.call(this);
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      callback: IntersectionObserverCallback;
      targets = new Set<Element>();
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.targets.add(target);
        visibility.set(target, this.callback);
      }
      disconnect() {
        for (const target of this.targets) visibility.delete(target);
        this.targets.clear();
      }
      unobserve(target: Element) {
        visibility.delete(target);
        this.targets.delete(target);
      }
    }
  );
  const active = ref(true);
  const content = ref("graph TD; A-->Initial");
  const status = ref("stable");
  const streaming = ref(false);
  const screenshot = ref(false);
  const viewportElement = ref<HTMLElement | null>(null);
  state.render.mockImplementation(async (_id, content) => ({
    svg: "<svg><text>" + state.theme + ":" + content + "</text></svg>",
  }));
  const wrapper = mount(
    defineComponent({
      setup() {
        provideRendererViewState(active);
        provide(RICH_TEXT_CONTEXT_KEY, { isStreaming: streaming });
        provide("screenshotMode", screenshot);
        provide(rendererViewportKey, viewportElement);
        return () =>
          h(
            "div",
            { ref: viewportElement, class: "test-viewport" },
            active.value
              ? [
                  h(MermaidNode, {
                    nodeId: "restored-diagram",
                    content: content.value,
                    "data-node-status": status.value,
                  }),
                ]
              : []
          );
      },
    }),
    { attachTo: document.body }
  );
  wrappers.push(wrapper);
  return {
    wrapper,
    top,
    active,
    content,
    status,
    streaming,
    screenshot,
    async restore() {
      await flushPromises();
      expect(wrapper.get("svg text").text()).toContain("Initial");
      active.value = false;
      await flushPromises();
      active.value = true;
      await flushPromises();
      expect(wrapper.get(".mermaid-container").attributes("style")).toContain(
        "height: 240px"
      );
      expect(wrapper.find(".mermaid-svg > svg").exists()).toBe(false);
    },
    enter() {
      const target = wrapper.get(".mermaid-container").element;
      visibility.get(target)!(
        [{ target, isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    },
  };
}

it("restores offscreen diagram height and delays SVG until visible using the latest theme", async () => {
  const view = restoredDiagram();
  await view.restore();
  state.dark.value = true;
  await flushPromises();
  expect(state.render).toHaveBeenCalledTimes(1);
  let finish!: (value: { svg: string }) => void;
  state.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  view.enter();
  await flushPromises();
  // Preserve geometry while the now-visible diagram is still awaiting layout.
  expect(view.wrapper.get(".mermaid-container").attributes("style")).toContain(
    "height: 240px"
  );
  expect(state.theme).toBe("dark");
  finish({ svg: "<svg><text>latest dark output</text></svg>" });
  await flushPromises();
  expect(view.wrapper.get("svg text").text()).toBe("latest dark output");
  expect(
    view.wrapper.get(".mermaid-container").attributes("style") ?? ""
  ).not.toContain("height:");
});

// These public modes require current output even when the restored block stays offscreen.
it.each(["content", "pending", "streaming", "screenshot"] as const)(
  "%s resumes an offscreen restored diagram without a visibility event",
  async (mode) => {
    const view = restoredDiagram();
    await view.restore();
    if (mode === "content") view.content.value = "graph TD; A-->Updated";
    else if (mode === "pending") view.status.value = "pending";
    else if (mode === "streaming") view.streaming.value = true;
    else view.screenshot.value = true;
    await flushPromises();
    expect(view.wrapper.find(".mermaid-svg > svg").exists()).toBe(true);
    expect(view.wrapper.get("svg text").text()).toContain(
      mode === "content" ? "Updated" : "Initial"
    );
  }
);

// Background WebViews can defer observer notifications until input. Returning must still show visible output.
it("restores the reading viewport on its first frame while visibility observers stay silent", async () => {
  const view = restoredDiagram();
  await view.restore();
  view.top.value = 100;
  await vi.waitFor(() => {
    expect(view.wrapper.find(".mermaid-svg > svg").exists()).toBe(true);
  });
  expect(view.wrapper.get("svg text").text()).toContain("Initial");
});

it("follows delayed restored scrolling while visibility observers stay silent", async () => {
  const view = restoredDiagram();
  await view.restore();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(view.wrapper.find(".mermaid-svg > svg").exists()).toBe(false);
  view.top.value = 100;
  window.dispatchEvent(new Event("scroll"));
  await vi.waitFor(() =>
    expect(view.wrapper.find(".mermaid-svg > svg").exists()).toBe(true)
  );
});

// Burst updates keep a readable successful diagram; closure must publish the full final source immediately.
it("coalesces pending updates and commits closure without a queued older diagram", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  state.render.mockImplementation(async (_id, content) => ({
    svg: "<svg><text>" + content + "</text></svg>",
  }));
  const content = ref("graph TD\nA-->Initial\npartial");
  const status = ref("pending");
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(MermaidNode, {
          nodeId: "streaming-diagram",
          content: content.value,
          "data-node-status": status.value,
        }),
    })
  );
  const setInput = async (update: {
    content?: string;
    "data-node-status"?: string;
  }) => {
    if (update.content !== undefined) content.value = update.content;
    if (update["data-node-status"] !== undefined)
      status.value = update["data-node-status"];
    await nextTick();
  };
  wrappers.push(wrapper);
  try {
    await flushPromises();
    const initialCalls = state.render.mock.calls.length;
    await setInput({ content: "graph TD\nA-->Initial\npartial tail" });
    await flushPromises();
    expect(state.render.mock.calls.length).toBe(initialCalls);
    await setInput({ content: "graph TD\nA-->New\npartial" });
    await setInput({ content: "graph TD\nA-->Latest\npartial" });
    await flushPromises();
    expect(wrapper.get("svg text").text()).toContain("Initial");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(wrapper.get("svg text").text()).toContain("Latest");
    await setInput({ content: "graph TD\nA-->Final\nFinal-->Done" });
    await setInput({ "data-node-status": "stable" });
    await flushPromises();
    expect(wrapper.get("svg text").text()).toContain("Final-->Done");
    const closedCalls = state.render.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(state.render.mock.calls.length).toBe(closedCalls);
    await setInput({
      "data-node-status": "pending",
      content: "graph TD\nA-->Queued\ntail",
    });
    wrapper.unmount();
    const unmountedCalls = state.render.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(state.render.mock.calls.length).toBe(unmountedCalls);
  } finally {
    vi.useRealTimers();
  }
});
