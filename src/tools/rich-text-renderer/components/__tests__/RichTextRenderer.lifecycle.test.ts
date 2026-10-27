// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import {
  defineComponent,
  h,
  KeepAlive,
  nextTick,
  ref,
  provide,
  type Ref,
} from "vue";
import {
  rendererReadingScopeKey,
  rendererRowGeometryKey,
  rendererLayoutRevisionKey,
  provideRendererReadingInteraction,
} from "../../composables/useRendererDisplay";
import CodeBlockNode from "../nodes/CodeBlockNode.vue";
import VcpToolNode from "../nodes/VcpToolNode.vue";
import { RICH_TEXT_CONTEXT_KEY } from "../../types";
import LlmThinkNode from "../nodes/LlmThinkNode.vue";
import { provideRendererViewState } from "../../composables/useRendererViewState";
import RichTextRenderer from "../../RichTextRenderer.vue";
import { rendererHostActiveKey } from "../../composables/useRendererViewState";
import { RendererVersion } from "../../types";
import { Tokenizer } from "../../parser/Tokenizer";
import type { ChatRegexRule } from "@/tools/llm-chat/types/chatRegex";
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
afterEach(() => {
  wrapper?.unmount();
  document.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
});
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
    nearby?: Ref<boolean>;
    layoutRevision?: Ref<string>;
    rowGeometry?: boolean;
  } = {
    suspendOnDeactivate: true,
  }
) {
  const active = ref(true);
  const text = ref(content);
  const streaming = ref(options.isStreaming ?? false);
  const rules = ref<ChatRegexRule[]>([]);
  const Page = defineComponent({
    setup: () => () =>
      h(RichTextRenderer, {
        content: text.value,
        regexRules: rules.value,
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
      setup() {
        if (options.rowGeometry) provide(rendererRowGeometryKey, true);
        if (options.nearby) {
          provide(rendererReadingScopeKey, options.nearby);
          provideRendererReadingInteraction(active);
        }
        if (options.layoutRevision)
          provide(rendererLayoutRevisionKey, options.layoutRevision);
        return () =>
          h(KeepAlive, null, {
            default: () => (active.value ? h(Page) : h("div", "home")),
          });
      },
    }),
    { attachTo: document.body }
  );
  return {
    active,
    text,
    streaming,
    rules,
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

function rendererMeasurements() {
  const callbacks = new Map<Element, ResizeObserverCallback>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) {
        callbacks.set(element, this.callback);
      }
      unobserve(element: Element) {
        callbacks.delete(element);
      }
      disconnect() {
        for (const [element, callback] of callbacks)
          if (callback === this.callback) callbacks.delete(element);
      }
    }
  );
  return (element: Element, width: number, height: number) => {
    const callback = callbacks.get(element);
    if (!callback) throw new Error("Renderer measurement target missing");
    callback(
      [
        {
          target: element,
          contentRect: { width, height },
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver
    );
  };
}
async function quietDisplay() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await nextTick();
}

// Protect first display, occupied geometry and disclosure state during active-page recycling.
it("recycles measured offscreen prose and restores its disclosure state", async () => {
  const measure = rendererMeasurements();
  const nearby = ref(false);
  const state = host(
    "<details><summary>More</summary>kept detail</details>\n\n- kept item",
    { suspendOnDeactivate: true, nearby }
  );
  await settle();
  const root = state.renderer().element;
  const details = state.renderer().get("details");
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger("toggle");
  await quietDisplay();
  expect(root.querySelector("li")?.textContent).toContain("kept item");
  measure(root, 800, 1200.375);
  await quietDisplay();
  expect(root.querySelector("li")).toBeNull();
  expect(parseFloat((root as HTMLElement).style.height)).toBeCloseTo(1200.375);
  nearby.value = true;
  await settle();
  expect(root.querySelector("li")?.textContent).toContain("kept item");
  expect((root.querySelector("details") as HTMLDetailsElement).open).toBe(true);
});

it("revalidates resized placeholders and changed source or font layout before recycling", async () => {
  const measure = rendererMeasurements();
  const nearby = ref(false),
    layoutRevision = ref("wide");
  const state = host("- before", {
    suspendOnDeactivate: true,
    nearby,
    layoutRevision,
  });
  await settle();
  const root = state.renderer().element;
  measure(root, 800, 1200);
  await quietDisplay();
  expect(root.querySelector("li")).toBeNull();
  measure(root, 320, 1200); // Old placeholder at a new width is not a measurement of its content.
  await settle();
  await quietDisplay();
  expect(root.querySelector("li")?.textContent).toBe("before");
  measure(root, 320, 220);
  await quietDisplay();
  expect((root as HTMLElement).style.height).toBe("220px");
  state.text.value = "- after";
  await settle();
  expect(root.querySelector("li")?.textContent).toBe("after");
  measure(root, 320, 240);
  await quietDisplay();
  layoutRevision.value = "new font";
  await settle();
  expect(root.querySelector("li")?.textContent).toBe("after");
});

it("preserves focused controls and materializes copied content across suspended messages", async () => {
  const measure = rendererMeasurements();
  const nearby = ref(true);
  const state = host(
    '<button type="button">kept button</button><p>copied history</p>',
    {
      suspendOnDeactivate: true,
      nearby,
      version: RendererVersion.PURE_MARKDOWN_IT,
    }
  );
  await settle();
  const root = state.renderer().element;
  const button = root.querySelector("button")!;
  button.focus();
  measure(root, 800, 600);
  nearby.value = false;
  await quietDisplay();
  expect(root.querySelector("button")).toBe(button);
  button.blur();
  await quietDisplay();
  expect(root.querySelector("button")).toBeNull();
  const selection = document.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  await settle();
  expect(root.querySelector("button")).not.toBeNull();
  expect(selection.toString()).toContain("copied history");
  selection.removeAllRanges();
  document.dispatchEvent(new Event("selectionchange"));
  await quietDisplay();
  expect(root.querySelector("button")).toBeNull();
});

it("keeps native form state mounted while a completed message is offscreen", async () => {
  const measure = rendererMeasurements();
  const nearby = ref(false);
  const state = host('<input value="initial">', {
    suspendOnDeactivate: true,
    nearby,
    version: RendererVersion.PURE_MARKDOWN_IT,
  });
  await settle();
  const root = state.renderer().element;
  const input = root.querySelector("input")!;
  input.value = "unsaved edit";
  measure(root, 800, 600);
  await quietDisplay();
  expect(root.querySelector("input")).toBe(input);
  expect(input.value).toBe("unsaved edit");
});

// Protect deferred initialization and visited reading state, independently of AST caching.
it("initializes nested details on first open and keeps visited reading state", async () => {
  const state = host(
    "<details><summary>Outer</summary><details><summary>Inner</summary><p>nested reading body</p></details></details>"
  );
  await settle();
  expect(state.renderer().findAll("details")).toHaveLength(1);
  expect(state.renderer().find("p").exists()).toBe(false);
  const outer = state.renderer().get("details");
  (outer.element as HTMLDetailsElement).open = true;
  await outer.trigger("toggle");
  const inner = state.renderer().findAll("details")[1];
  expect(state.renderer().find("p").exists()).toBe(false);
  (inner.element as HTMLDetailsElement).open = true;
  await inner.trigger("toggle");
  const body = inner.get(".details-content").element as HTMLElement;
  body.scrollTop = 80;
  (outer.element as HTMLDetailsElement).open = false;
  await outer.trigger("toggle");
  (outer.element as HTMLDetailsElement).open = true;
  await outer.trigger("toggle");
  expect(state.renderer().findAll(".details-content")[1].element).toBe(body);
  expect(body.scrollTop).toBe(80);
  expect((inner.element as HTMLDetailsElement).open).toBe(true);
});

it("opens default details immediately and reveals the latest deferred source", async () => {
  const state = host(
    "<details open><summary>Ready</summary><p>default body</p></details>"
  );
  await settle();
  expect(state.renderer().get("p").text()).toBe("default body");
  state.text.value =
    "<details><summary>Later</summary><p>old deferred body</p></details>";
  await settle();
  state.text.value =
    "<details><summary>Later</summary><p>latest deferred body</p></details>";
  await settle();
  const details = state.renderer().get("details");
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger("toggle");
  expect(state.renderer().get("p").text()).toBe("latest deferred body");
});

it("copies unopened nested bodies without expanding them and retains visited state across host recycling", async () => {
  const writeText = vi.fn(async (_text: string) => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const state = host(
    "<details><summary>Outer</summary><p>outer body</p><details><summary>Inner</summary><p>nested body</p></details></details>"
  );
  await settle();
  const content = state.renderer().get(".details-content").element;
  // jsdom has no rendered innerText; native verification covers that layout-dependent contract.
  Object.defineProperty(content, "innerText", {
    get: () => content.textContent,
  });
  await state.renderer().get(".details-action-btn").trigger("click");
  await flushPromises();
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0][0]).toContain("outer body");
  expect(writeText.mock.calls[0][0]).toContain("nested body");
  expect(
    state
      .renderer()
      .findAll("details")
      .every((d) => !(d.element as HTMLDetailsElement).open)
  ).toBe(true);
  state.active.value = false;
  await settle();
  state.active.value = true;
  await settle();
  expect(
    state
      .renderer()
      .findAll("p")
      .map((p) => p.text())
  ).toEqual(["outer body", "nested body"]);
  expect(
    state
      .renderer()
      .findAll("details")
      .every((d) => !(d.element as HTMLDetailsElement).open)
  ).toBe(true);
});

// Unknown row geometry stays with the outer list; display initialization follows actual reading intent.
it.each([
  RendererVersion.V1_MARKDOWN_IT,
  RendererVersion.V2_CUSTOM_PARSER,
  RendererVersion.PURE_MARKDOWN_IT,
])("reveals current deferred history on demand with %s", async (version) => {
  const nearby = ref(false);
  const state = host("- unseen", {
    suspendOnDeactivate: true,
    nearby,
    rowGeometry: true,
    version,
  });
  await settle();
  expect(state.renderer().find("li").exists()).toBe(false);
  state.text.value = "- updated while unseen";
  await settle();
  expect(state.renderer().find("li").exists()).toBe(false);
  state.rules.value = [
    {
      id: "deferred-render-rule",
      enabled: true,
      regex: "updated while unseen",
      replacement: "latest visible",
      applyTo: { render: true, request: false },
      targetRoles: ["assistant"],
    },
  ];
  nearby.value = true;
  await settle();
  expect(state.renderer().get("li").text()).toBe("latest visible");
  state.active.value = false;
  nearby.value = false;
  await settle();
  state.active.value = true;
  await settle();
  expect(state.renderer().find("li").exists()).toBe(false);
  nearby.value = true;
  await settle();
  expect(state.renderer().get("li").text()).toBe("latest visible");
});

// Pure rendering remains usable after the component has parsed with another backend.
it("preserves pure Markdown formatting through AST version switches", async () => {
  wrapper = mount(RichTextRenderer, {
    props: {
      version: RendererVersion.PURE_MARKDOWN_IT,
      content: "**first**\r\nhttps://example.org",
      enableEnterAnimation: false,
      throttleEnabled: false,
    },
  });
  await settle();
  expect(wrapper.get("strong").text()).toBe("first");
  expect(wrapper.findAll("br")).toHaveLength(1);
  expect(wrapper.get("a").attributes("href")).toBe("https://example.org");

  await wrapper.setProps({
    version: RendererVersion.V2_CUSTOM_PARSER,
    content: "**second**",
  });
  await settle();
  expect(wrapper.get("strong").text()).toBe("second");
  await wrapper.setProps({
    version: RendererVersion.PURE_MARKDOWN_IT,
    content: "**latest**\r\nhttps://example.net",
  });
  await settle();
  expect(wrapper.get("strong").text()).toBe("latest");
  expect(wrapper.findAll("br")).toHaveLength(1);
  expect(wrapper.get("a").attributes("href")).toBe("https://example.net");
});

it("renders and completes a pure-mode chunk stream with normalized line endings", async () => {
  let push: (chunk: string) => void = () => {};
  let finish: () => void = () => {};
  wrapper = mount(RichTextRenderer, {
    props: {
      version: RendererVersion.PURE_MARKDOWN_IT,
      streamSource: {
        subscribe(callback: (chunk: string) => void) {
          push = callback;
          return () => {};
        },
        onComplete(callback: () => void) {
          finish = callback;
          return () => {};
        },
      },
      smoothingEnabled: false,
      enableEnterAnimation: false,
    },
  });
  push("**stream");
  await settle();
  expect(wrapper.find("strong").exists()).toBe(false);
  push(" complete**\r\nhttps://example.org");
  finish();
  await settle();
  expect(wrapper.get("strong").text()).toBe("stream complete");
  expect(wrapper.findAll("br")).toHaveLength(1);
  expect(wrapper.get("a").attributes("href")).toBe("https://example.org");
});

// Reading-area deferral must yield immediately to a live message, even in an inactive host.
it("initializes a live message from an unseen row and restores its completed output", async () => {
  const nearby = ref(false);
  const state = host("- dormant", {
    suspendOnDeactivate: true,
    nearby,
    rowGeometry: true,
  });
  await settle();
  state.streaming.value = true;
  state.text.value = "- growing";
  await settle();
  expect(state.renderer().get("li").text()).toBe("growing");
  const root = state.renderer().element;
  state.active.value = false;
  state.text.value = "- completed";
  await settle();
  expect(root.querySelector("li")?.textContent).toBe("completed");
  state.streaming.value = false;
  await settle();
  state.active.value = true;
  nearby.value = true;
  await settle();
  expect(state.renderer().get("li").text()).toBe("completed");
});
