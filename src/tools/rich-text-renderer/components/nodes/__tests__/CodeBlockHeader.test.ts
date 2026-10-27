// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import CodeBlockHeader from "../code-block/CodeBlockHeader.vue";

const props = {
  viewMode: "code" as const,
  isHtml: true,
  isExpanded: false,
  wordWrapEnabled: false,
  copied: false,
  codeFontSize: 16,
  codeFontMin: 10,
  codeFontMax: 24,
  defaultCodeFontSize: 14,
  fontBaselineReady: true,
  tokenCount: 0,
  showTokenCount: false,
  contentLength: 42,
  closed: true,
};
let wrapper: VueWrapper;
function header() {
  wrapper = mount(CodeBlockHeader, { props, attachTo: document.body });
  return wrapper;
}
function button(action: string) {
  return wrapper.get<HTMLButtonElement>('[data-code-action="' + action + '"]');
}
function description(action: string) {
  const id = button(action).attributes("aria-describedby");
  return id ? document.getElementById(id)?.textContent : undefined;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// Protects keyboard guidance, current copy feedback, focus continuity and Escape dismissal.
it("describes the focused action after the delay and keeps its state and focus current", async () => {
  header();
  const originalCopyLabel = button("copy-code").attributes("aria-label");
  button("copy-code").element.focus();
  await nextTick();
  await vi.advanceTimersByTimeAsync(299);
  expect(description("copy-code")).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(description("copy-code")).toBe(originalCopyLabel);
  await button("copy-code").trigger("click");
  expect(wrapper.emitted("copy-code")).toEqual([[]]);
  await wrapper.setProps({ copied: true });
  expect(description("copy-code")).toBe(
    button("copy-code").attributes("aria-label")
  );
  expect(description("copy-code")).not.toBe(originalCopyLabel);
  expect(document.activeElement).toBe(button("copy-code").element);
  await button("copy-code").trigger("keydown", { key: "Escape" });
  expect(description("copy-code")).toBeUndefined();
  expect(document.activeElement).toBe(button("copy-code").element);
  // Keyboard navigation takes over from a pointer still resting on another action.
  await button("toggle-word-wrap").trigger("pointerover", {
    pointerType: "mouse",
  });
  await vi.advanceTimersByTimeAsync(300);
  expect(description("toggle-word-wrap")).toBe(
    button("toggle-word-wrap").attributes("aria-label")
  );
  button("toggle-expand").element.focus();
  await nextTick();
  await vi.advanceTimersByTimeAsync(300);
  expect(description("toggle-expand")).toBe(
    button("toggle-expand").attributes("aria-label")
  );
  await wrapper.setProps({ isExpanded: true });
  expect(description("toggle-expand")).toBe(
    button("toggle-expand").attributes("aria-label")
  );
  expect(button("toggle-expand").attributes("aria-expanded")).toBe("true");
  button("toggle-expand").element.blur();
  await nextTick();
  expect(description("toggle-expand")).toBeUndefined();
});

// Protects pointer targeting through icon descendants and cancellation on leave/unmount.
it("follows pointer intent between actions and cancels stale hints", async () => {
  header();
  await button("copy-code")
    .get("svg")
    .trigger("pointerover", { pointerType: "mouse" });
  await vi.advanceTimersByTimeAsync(200);
  await button("toggle-word-wrap")
    .get("svg")
    .trigger("pointerover", { pointerType: "mouse" });
  await vi.advanceTimersByTimeAsync(200);
  expect(description("toggle-word-wrap")).toBeUndefined();
  await vi.advanceTimersByTimeAsync(100);
  expect(description("toggle-word-wrap")).toBe(
    button("toggle-word-wrap").attributes("aria-label")
  );
  await wrapper.setProps({ wordWrapEnabled: true });
  expect(description("toggle-word-wrap")).toBe(
    button("toggle-word-wrap").attributes("aria-label")
  );
  expect(button("toggle-word-wrap").attributes("aria-pressed")).toBe("true");
  await wrapper.get(".header-actions").trigger("pointerleave");
  expect(description("toggle-word-wrap")).toBeUndefined();
  await button("copy-code").trigger("pointerover", { pointerType: "mouse" });
  wrapper.unmount();
  await vi.advanceTimersByTimeAsync(400);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});

// Protects public commands and disabled boundaries independently of tooltip implementation.
it("dispatches enabled commands while respecting font and streaming preview limits", async () => {
  header();
  const commands = [
    "toggle-view-mode",
    "open-dialog-preview",
    "decrease-font",
    "reset-font",
    "increase-font",
    "toggle-word-wrap",
    "copy-code",
    "toggle-expand",
  ];
  for (const action of commands) {
    await button(action).trigger("click");
    expect(wrapper.emitted(action)).toEqual([[]]);
  }
  await wrapper.setProps({
    closed: false,
    codeFontSize: 10,
    fontBaselineReady: false,
  });
  for (const action of ["open-dialog-preview", "decrease-font", "reset-font"]) {
    expect(button(action).element.disabled).toBe(true);
    await button(action).trigger("click");
    expect(wrapper.emitted(action)).toEqual([[]]);
  }
  await wrapper.setProps({
    codeFontSize: 24,
    viewMode: "preview",
    isExpanded: true,
    wordWrapEnabled: true,
  });
  expect(button("increase-font").element.disabled).toBe(true);
  expect(button("toggle-view-mode").attributes("aria-pressed")).toBe("true");
  expect(button("toggle-expand").attributes("aria-expanded")).toBe("true");
});
