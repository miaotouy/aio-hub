// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, ref, provide } from "vue";
import CodeBlockNode from "../nodes/CodeBlockNode.vue";
import VcpToolNode from "../nodes/VcpToolNode.vue";
import { RICH_TEXT_CONTEXT_KEY } from "../../types";
import LlmThinkNode from "../nodes/LlmThinkNode.vue";
import { provideRendererViewState } from "../../composables/useRendererViewState";
import RichTextRenderer from "../../RichTextRenderer.vue";
import { rendererHostActiveKey } from "../../composables/useRendererViewState";
import { RendererVersion } from "../../types";
import { Tokenizer } from "../../parser/Tokenizer";
import type { TokenizerOptions } from "../../parser/types";

// Use the production tokenizer in process; jsdom has no Worker transport.
vi.mock("../../parser/tokenizerService", () => ({
  tokenizerService: {
    tokenize: async (text: string, options: TokenizerOptions) =>
      new Tokenizer(options).tokenize(text),
  },
}));

vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: { calculate: vi.fn() },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/tools/token-calculator/worker/calculator.proxy", () => ({
  calculatorProxy: { calculate: vi.fn() },
}));
let wrapper: ReturnType<typeof mount>;
afterEach(() => wrapper?.unmount());
async function settle() {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 80));
  await nextTick();
}
function host(
  content: string,
  options: {
    suspendOnDeactivate?: boolean;
    isStreaming?: boolean;
    version?: RendererVersion;
  } = {
    suspendOnDeactivate: true,
  }
) {
  const active = ref(true);
  const text = ref(content);
  const streaming = ref(options.isStreaming ?? false);
  const Page = defineComponent({
    setup: () => () =>
      h(RichTextRenderer, {
        content: text.value,
        version: options.version ?? RendererVersion.V2_CUSTOM_PARSER,
        suspendOnDeactivate: options.suspendOnDeactivate,
        isStreaming: streaming.value,
        allowDangerousHtml: true,
        throttleEnabled: false,
        enableEnterAnimation: true,
      }),
  });
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (active.value ? h(Page) : h("div", "home")),
        }),
    }),
    { attachTo: document.body }
  );
  return {
    active,
    text,
    streaming,
    renderer: () => wrapper.findComponent(RichTextRenderer),
  };
}

// Protect rendered content and local disclosure state across a disposable display subtree.
it("reclaims inactive prose and restores current content and disclosure choices", async () => {
  const state = host(
    "<details><summary>More</summary>old text</details>\n\n- first\n- second"
  );
  await settle();
  const renderer = state.renderer();
  const root = renderer.element;
  const details = renderer.get("details");
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger("toggle");
  expect(renderer.findAll("li")).toHaveLength(2);
  state.active.value = false;
  await settle();
  expect(root.querySelector("li")).toBeNull();
  expect(root.querySelector("details")).toBeNull();
  state.active.value = true;
  await settle();
  expect(
    (state.renderer().get("details").element as HTMLDetailsElement).open
  ).toBe(true);
  expect(state.renderer().text()).toContain("old text");
  expect(state.renderer().find(".rich-text-node").exists()).toBe(false);
  state.active.value = false;
  await settle();
  state.text.value = "Updated while away\n\n- latest";
  await settle();
  state.active.value = true;
  await settle();
  expect(state.renderer().text()).toContain("Updated while away");
  expect(state.renderer().findAll("li")).toHaveLength(1);
});

it("keeps live streams mounted, then releases completed inactive output", async () => {
  const state = host("- live", {
    suspendOnDeactivate: true,
    isStreaming: true,
  });
  await settle();
  const root = state.renderer().element;
  state.active.value = false;
  await settle();
  expect(root.querySelector("li")).not.toBeNull();
  state.streaming.value = false;
  await settle();
  expect(root.querySelector("li")).toBeNull();
  state.active.value = true;
  await settle();
  expect(state.renderer().text()).toContain("live");
});

it.each([false, true])(
  "preserves embedded form state with suspension=%s",
  async (enabled) => {
    const state = host('<input value="initial">', {
      suspendOnDeactivate: enabled,
      version: RendererVersion.PURE_MARKDOWN_IT,
    });
    await settle();
    const root = state.renderer().element;
    const input = root.querySelector("input")!;
    expect(input).not.toBeNull();
    input.value = "unsaved";
    state.active.value = false;
    await settle();
    state.active.value = true;
    await settle();
    expect(state.renderer().element.querySelector("input")).toBe(input);
    expect(input.value).toBe("unsaved");
  }
);

// A session can append a new renderer while its route stays cached in the background.
it("new inactive-host renderers stay compact and reveal current text on return", async () => {
  const active = ref(false);
  wrapper = mount(
    defineComponent({
      setup() {
        provide(rendererHostActiveKey, active);
        return () =>
          h(RichTextRenderer, {
            content: "- background",
            version: RendererVersion.V2_CUSTOM_PARSER,
            suspendOnDeactivate: true,
            throttleEnabled: false,
          });
      },
    })
  );
  await settle();
  expect(wrapper.find("li").exists()).toBe(false);
  active.value = true;
  await settle();
  expect(wrapper.get("li").text()).toBe("background");
});

// Completed thinking duration is a recorded result; route downtime must not extend it.
it("restores a completed thinking duration without counting time away", async () => {
  vi.useFakeTimers();
  const active = ref(true);
  const thinking = ref(true);
  try {
    vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
    wrapper = mount(
      defineComponent({
        setup() {
          provideRendererViewState(active);
          return () =>
            active.value
              ? h(LlmThinkNode, {
                  nodeId: "think-1",
                  rawTagName: "think",
                  ruleId: "custom",
                  displayName: "Thinking",
                  collapsedByDefault: false,
                  isThinking: thinking.value,
                  rawContent: "reasoning",
                })
              : h("div");
        },
      })
    );
    await vi.advanceTimersByTimeAsync(1000);
    thinking.value = false;
    await nextTick();
    const duration = wrapper.get(".thinking-time").text();
    expect(duration).toBe("1.0s");
    active.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(20000);
    active.value = true;
    await nextTick();
    expect(wrapper.get(".thinking-time").text()).toBe(duration);
  } finally {
    vi.useRealTimers();
  }
});

// User choices survive page switches; changed global defaults still apply to the recreated controls.
it("restored code and tool views honor defaults changed while away", async () => {
  const active = ref(true);
  const expanded = ref(false);
  const renderHtml = ref(false);
  const collapsed = ref(false);
  wrapper = mount(
    defineComponent({
      setup() {
        provideRendererViewState(active);
        provide(RICH_TEXT_CONTEXT_KEY, {
          defaultCodeBlockExpanded: expanded,
          defaultRenderHtml: renderHtml,
          defaultToolCallCollapsed: collapsed,
        });
        return () =>
          active.value
            ? h("div", [
                h(CodeBlockNode, {
                  nodeId: "code-settings",
                  language: "html",
                  content: "<!doctype html><html><body>preview</body></html>",
                  closed: true,
                }),
                h(VcpToolNode, {
                  nodeId: "tool-settings",
                  collapsedByDefault: collapsed.value,
                  tool_name: "Fixture",
                  command: "read",
                  args: {},
                  closed: true,
                  raw: "fixture",
                }),
              ])
            : h("div");
      },
    }),
    {
      global: {
        stubs: { CodeMirrorSourceViewer: true, HtmlInteractiveViewer: true },
      },
    }
  );
  const code = () => wrapper.findComponent(CodeBlockNode);
  const tool = () => wrapper.get(".vcp-content");
  expect(
    code().findComponent({ name: "CodeBlockHeader" }).props("isExpanded")
  ).toBe(false);
  expect((tool().element as HTMLElement).style.display).not.toContain("none");
  active.value = false;
  await nextTick();
  expanded.value = true;
  renderHtml.value = true;
  collapsed.value = true;
  active.value = true;
  await nextTick();
  const header = code().findComponent({ name: "CodeBlockHeader" });
  expect(header.props("isExpanded")).toBe(true);
  expect(header.props("viewMode")).toBe("preview");
  expect((tool().element as HTMLElement).style.display).toContain("none");
  header.vm.$emit("increase-font");
  header.vm.$emit("toggle-word-wrap");
  header.vm.$emit("toggle-expand");
  header.vm.$emit("toggle-view-mode");
  await nextTick();
  active.value = false;
  await nextTick();
  active.value = true;
  await nextTick();
  expect(
    code().findComponent({ name: "CodeBlockHeader" }).props("isExpanded")
  ).toBe(false);
  expect(
    code().findComponent({ name: "CodeBlockHeader" }).props("viewMode")
  ).toBe("code");
  expect(
    code().findComponent({ name: "CodeBlockHeader" }).props("codeFontSize")
  ).toBe(15);
  expect(
    code().findComponent({ name: "CodeBlockHeader" }).props("wordWrapEnabled")
  ).toBe(true);
});
