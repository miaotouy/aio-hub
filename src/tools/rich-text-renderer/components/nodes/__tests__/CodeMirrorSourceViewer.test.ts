// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { EditorView } from "@codemirror/view";
import {
  foldEffect,
  foldedRanges,
  StreamLanguage,
  language,
} from "@codemirror/language";
import CodeMirrorSourceViewer from "../code-block/CodeMirrorSourceViewer.vue";
import { provideRendererViewState } from "../../../composables/useRendererViewState";

const loadLanguage = vi.hoisted(() =>
  vi.fn<
    (
      ...args: unknown[]
    ) => Promise<import("@codemirror/state").Extension | null>
  >(async () => null)
);
const observer = vi.hoisted(() => ({
  notify: undefined as undefined | IntersectionObserverCallback,
}));
vi.mock("@vueuse/core", () => ({
  useIntersectionObserver: (
    _: unknown,
    notify: IntersectionObserverCallback
  ) => {
    observer.notify = notify;
  },
}));
vi.mock("../../../stores/store", () => ({
  useRichTextRendererStore: () => ({ debugPreFallback: ref(false) }),
}));
vi.mock("pinia", () => ({ storeToRefs: (store: unknown) => store }));
vi.mock("@composables/useTheme", () => ({
  useTheme: () => ({ isDark: ref(false) }),
}));
vi.mock("@/utils/codeLanguages", () => ({
  getCodeMirrorLanguage: loadLanguage,
}));

const props = {
  content: "first line\nsecond line\nthird line",
  isExpanded: true,
  codeFontSize: 16,
  wordWrapEnabled: false,
  closed: true,
};
let wrapper: ReturnType<typeof mount>;
async function intersect(visible: boolean) {
  observer.notify!(
    [
      {
        isIntersecting: visible,
        boundingClientRect: { height: 96 },
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver
  );
  await nextTick();
}
function currentView() {
  return EditorView.findFromDOM(
    wrapper.get(".cm-editor").element as HTMLElement
  )!;
}
beforeEach(() => {
  vi.useFakeTimers();
  loadLanguage.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  wrapper?.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// Protects read-only code, folding, selection, scroll and user font settings across eviction.
it("restores a suspended viewer from scalar UI state while displaying current code", async () => {
  wrapper = mount(CodeMirrorSourceViewer, { props });
  expect(wrapper.find(".cm-editor").exists()).toBe(false);
  await intersect(true);
  const view = currentView();
  view.dispatch({
    selection: { anchor: 2, head: 5 },
    effects: foldEffect.of({ from: 10, to: 22 }),
  });
  view.scrollDOM.scrollTop = 36;
  view.scrollDOM.scrollLeft = 24;
  expect(wrapper.find(".pre-code-node").exists()).toBe(false);
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  expect(wrapper.find(".cm-editor").exists()).toBe(false);
  expect(wrapper.get(".pre-code-node code").text()).toBe(props.content);
  expect(wrapper.get(".cm-viewer-container").attributes("style")).toContain(
    "96px"
  );
  await wrapper.setProps({ codeFontSize: 19, wordWrapEnabled: true });
  await intersect(true);
  const resumed = currentView();
  await vi.advanceTimersByTimeAsync(100);
  expect(resumed.scrollDOM.scrollTop).toBe(36);
  expect(resumed.scrollDOM.scrollLeft).toBe(24);
  expect(resumed.state.doc.toString()).toBe(props.content);
  expect(resumed.state.selection.main).toMatchObject({ anchor: 2, head: 5 });
  expect(foldedRanges(resumed.state).size).toBe(1);
  expect(wrapper.emitted("ready")).toEqual([[16]]);
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  await wrapper.setProps({ content: "replacement" });
  await intersect(true);
  expect(currentView().state.doc.toString()).toBe("replacement");
  expect(foldedRanges(currentView().state).size).toBe(0);
});

// Protects smooth backscroll and ongoing output from premature destruction.
it("keeps recently visible or streaming code alive and releases it after completion", async () => {
  wrapper = mount(CodeMirrorSourceViewer, {
    props: { ...props, closed: false },
  });
  await intersect(true);
  const view = currentView();
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  expect(currentView()).toBe(view);
  await wrapper.setProps({ closed: true });
  await vi.advanceTimersByTimeAsync(1000);
  await intersect(true);
  await vi.advanceTimersByTimeAsync(2100);
  expect(currentView()).toBe(view);
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  expect(wrapper.find(".cm-editor").exists()).toBe(false);
});

// Protects route KeepAlive memory release and return-to-chat rehydration.
it("releases the editor on KeepAlive deactivation and restores it on activation", async () => {
  const visible = ref(true);
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () =>
            visible.value ? h(CodeMirrorSourceViewer, props) : h("div"),
        }),
    })
  );
  await intersect(true);
  const old = currentView();
  const destroy = vi.spyOn(old, "destroy");
  visible.value = false;
  await nextTick();
  expect(destroy).toHaveBeenCalledOnce();
  visible.value = true;
  await nextTick();
  expect(currentView().state.doc.toString()).toBe(props.content);
});

// Protects a rehydrated view from a language import started by its destroyed predecessor.
it("ignores stale language loads after suspension and recreation", async () => {
  type Extension = import("@codemirror/state").Extension;
  let resolveOld!: (extension: Extension) => void;
  let resolveNew!: (extension: Extension) => void;
  loadLanguage
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNew = resolve;
        })
    );
  wrapper = mount(CodeMirrorSourceViewer, {
    props: { ...props, language: "old" },
  });
  await intersect(true);
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  await wrapper.setProps({ language: "new" });
  await intersect(true);
  const oldLanguage = StreamLanguage.define({
    token: (stream) => {
      stream.skipToEnd();
      return null;
    },
  });
  const newLanguage = StreamLanguage.define({
    token: (stream) => {
      stream.skipToEnd();
      return "string";
    },
  });
  resolveNew(newLanguage);
  await nextTick();
  expect(currentView().state.facet(language)).toBe(newLanguage);
  resolveOld(oldLanguage);
  await nextTick();
  expect(currentView().state.facet(language)).toBe(newLanguage);
});

// Protects keyboard navigation and copying code when the viewport moves away.
it("keeps focused or selected code available until the interaction ends", async () => {
  wrapper = mount(CodeMirrorSourceViewer, { props, attachTo: document.body });
  await intersect(true);
  const view = currentView();
  view.focus();
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  expect(currentView()).toBe(view);
  view.contentDOM.blur();
  const range = document.createRange();
  range.selectNode(view.dom);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  await vi.advanceTimersByTimeAsync(2100);
  expect(currentView()).toBe(view);
  selection.removeAllRanges();
  await vi.advanceTimersByTimeAsync(2100);
  expect(wrapper.find(".cm-editor").exists()).toBe(false);
});

// Full display eviction must preserve the same read-only selection/folds as editor-only eviction.
it("restores code selection and folds when the owning display tree remounts", async () => {
  const visible = ref(true);
  wrapper = mount(
    defineComponent({
      setup() {
        provideRendererViewState(visible);
        return () =>
          visible.value
            ? h(CodeMirrorSourceViewer, { ...props, nodeId: "source-1" })
            : h("div");
      },
    })
  );
  await intersect(true);
  const first = currentView();
  first.dispatch({
    selection: { anchor: 2, head: 5 },
    effects: foldEffect.of({ from: 10, to: 22 }),
  });
  visible.value = false;
  await nextTick();
  expect(wrapper.find(".cm-editor").exists()).toBe(false);
  visible.value = true;
  await nextTick();
  await intersect(true);
  const restored = currentView();
  expect(restored).not.toBe(first);
  expect(restored.state.selection.main.from).toBe(2);
  expect(restored.state.selection.main.to).toBe(5);
  const folds: number[][] = [];
  foldedRanges(restored.state).between(
    0,
    restored.state.doc.length,
    (from, to) => {
      folds.push([from, to]);
    }
  );
  expect(folds).toEqual([[10, 22]]);
});

// A chosen font must take effect immediately, with identical CSS before and after remount.
it("keeps live font size changes consistent after viewer recreation", async () => {
  wrapper = mount(CodeMirrorSourceViewer, { props, attachTo: document.body });
  await intersect(true);
  await wrapper.setProps({ codeFontSize: 19 });
  expect(getComputedStyle(currentView().dom).fontSize).toBe("19px");
  await intersect(false);
  await vi.advanceTimersByTimeAsync(2100);
  await intersect(true);
  expect(getComputedStyle(currentView().dom).fontSize).toBe("19px");
});

// Controlled code updates preserve reading state outside the changed text, including UTF-16 offsets.
it.each([
  {
    label: "streamed suffix",
    content: props.content + "\nnext line",
    folds: [[10, 22]],
  },
  {
    label: "CRLF stream",
    content: props.content.replace(/\n/g, "\r\n") + "\r\nnext line",
    folds: [[10, 22]],
  },
  {
    label: "edited tail",
    content: props.content.replace("third line", "third entry"),
    folds: [[10, 22]],
  },
  {
    label: "insertion before a folded region",
    content: props.content.replace("first", "first😀"),
    folds: [[12, 24]],
  },
])(
  "preserves selection and maps existing folds through $label",
  async ({ content, folds }) => {
    wrapper = mount(CodeMirrorSourceViewer, {
      props: { ...props, closed: false },
    });
    await intersect(true);
    const view = currentView();
    view.dispatch({
      selection: { anchor: 2, head: 4 },
      effects: foldEffect.of({ from: 10, to: 22 }),
    });
    await wrapper.setProps({ content });
    expect(view.state.doc.toString()).toBe(content.replace(/\r\n/g, "\n"));
    expect(view.state.selection.main).toMatchObject({ anchor: 2, head: 4 });
    const actual: number[][] = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      actual.push([from, to]);
    });
    expect(actual).toEqual(folds);
  }
);

// Repeated reading and font changes must keep document-level styling bounded after warmup.
it("keeps stylesheet rules stable through font changes and viewer recreation", async () => {
  wrapper = mount(CodeMirrorSourceViewer, { props, attachTo: document.body });
  await intersect(true);
  const ruleCount = () =>
    Array.from(document.styleSheets).reduce(
      (sum, sheet) => sum + sheet.cssRules.length,
      0
    );
  const warmedRules = ruleCount();
  for (let cycle = 0; cycle < 3; cycle++) {
    await wrapper.setProps({ codeFontSize: 19 });
    expect(getComputedStyle(currentView().dom).fontSize).toBe("19px");
    await wrapper.setProps({ codeFontSize: 16 });
    await intersect(false);
    await vi.advanceTimersByTimeAsync(2100);
    await intersect(true);
    expect(currentView().state.doc.toString()).toBe(props.content);
    expect(getComputedStyle(currentView().dom).fontSize).toBe("16px");
  }
  expect(ruleCount()).toBe(warmedRules);
});

// Sharing static styles must preserve each code block's own font setting.
it("keeps font settings independent between simultaneously mounted viewers", async () => {
  wrapper = mount(CodeMirrorSourceViewer, { props, attachTo: document.body });
  await intersect(true);
  const second = mount(CodeMirrorSourceViewer, {
    props: { ...props, codeFontSize: 13 },
    attachTo: document.body,
  });
  try {
    await intersect(true);
    const secondView = EditorView.findFromDOM(
      second.get(".cm-editor").element as HTMLElement
    )!;
    await wrapper.setProps({ codeFontSize: 19 });
    expect(getComputedStyle(currentView().dom).fontSize).toBe("19px");
    expect(getComputedStyle(secondView.dom).fontSize).toBe("13px");
    await second.setProps({ codeFontSize: 17 });
    expect(getComputedStyle(currentView().dom).fontSize).toBe("19px");
    expect(getComputedStyle(secondView.dom).fontSize).toBe("17px");
  } finally {
    second.unmount();
  }
});

// Fallback wrapping must preserve copyable source, including Unicode, tabs and final blank lines.
it("preserves source text when toggling fallback wrapping and creating the editor", async () => {
  const content = "第一行 α😀\n\t第二行\n\n";
  wrapper = mount(CodeMirrorSourceViewer, { props: { ...props, content } });
  const source = () => wrapper.get(".pre-code-node code").element.textContent;
  expect(source()).toBe(content);
  await wrapper.setProps({ wordWrapEnabled: true });
  expect(source()).toBe(content);
  await wrapper.setProps({ wordWrapEnabled: false });
  expect(source()).toBe(content);
  await intersect(true);
  expect(currentView().state.doc.toString()).toBe(content);
});
