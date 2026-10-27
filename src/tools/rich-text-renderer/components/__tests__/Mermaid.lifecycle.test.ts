// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, type Ref } from "vue";
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
