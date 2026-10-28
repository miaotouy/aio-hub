// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";
import HtmlInteractiveViewer from "../HtmlInteractiveViewer.vue";

// Keep srcdoc generation and scheduling real; isolate application theme/storage.
vi.mock("@/composables/useIframeTheme", () => ({
  useIframeTheme: (content: () => string) => ({
    themedContent: computed(content),
  }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn() },
}));

let wrapper: ReturnType<typeof mount> | undefined;
const page = (value: string) =>
  `<!doctype html><html><head></head><body><p>${value}</p></body></html>`;
const preview = () => wrapper!.get("iframe").attributes("srcdoc");
function start(content = page("initial")) {
  wrapper = mount(HtmlInteractiveViewer, {
    props: { content, showToolbar: false, enableCdnLocalizer: false },
  });
  return wrapper;
}
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

it("shows the latest burst value during a pause within one refresh interval", async () => {
  const viewer = start();
  expect(preview()).toContain("<p>initial</p>");
  await vi.advanceTimersByTimeAsync(120);
  await viewer.setProps({ content: page("middle") });
  await vi.advanceTimersByTimeAsync(120);
  await viewer.setProps({ content: page("latest") });
  await vi.advanceTimersByTimeAsync(759);
  expect(preview()).toContain("<p>initial</p>");
  await vi.advanceTimersByTimeAsync(1);
  expect(preview()).toContain("<p>latest</p>");
});

it("limits continuous updates while eventually displaying the last value", async () => {
  const viewer = start();
  for (let i = 1; i <= 4; i++) {
    await vi.advanceTimersByTimeAsync(200);
    await viewer.setProps({ content: page(String(i)) });
    expect(preview()).toContain("<p>initial</p>");
  }
  await vi.advanceTimersByTimeAsync(200);
  expect(preview()).toContain("<p>4</p>");
  await vi.advanceTimersByTimeAsync(100);
  await viewer.setProps({ content: page("last") });
  await vi.advanceTimersByTimeAsync(899);
  expect(preview()).toContain("<p>4</p>");
  await vi.advanceTimersByTimeAsync(1);
  expect(preview()).toContain("<p>last</p>");
});

it("commits immediate content and cancels the pending streamed refresh", async () => {
  const viewer = start();
  await vi.advanceTimersByTimeAsync(100);
  await viewer.setProps({ content: page("pending") });
  await vi.advanceTimersByTimeAsync(100);
  await viewer.setProps({ content: page("final"), immediate: true });
  expect(preview()).toContain("<p>final</p>");
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(1500);
  expect(preview()).toContain("<p>final</p>");
});

it("keeps stable content across a partial script and catches up when it closes", async () => {
  const viewer = start();
  await vi.advanceTimersByTimeAsync(100);
  const partial = page("changed").replace("</body>", "<script>void 0;");
  await viewer.setProps({ content: partial });
  await vi.advanceTimersByTimeAsync(1100);
  expect(preview()).toContain("<p>initial</p>");
  await viewer.setProps({ content: partial + "</script>" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(preview()).toContain("<p>changed</p>");
});

it("clears scheduled work on unmount and starts a new viewer with current content", async () => {
  const viewer = start();
  await vi.advanceTimersByTimeAsync(100);
  await viewer.setProps({ content: page("pending") });
  expect(vi.getTimerCount()).toBe(1);
  viewer.unmount();
  wrapper = undefined;
  expect(vi.getTimerCount()).toBe(0);
  start(page("new viewer"));
  await vi.advanceTimersByTimeAsync(1500);
  expect(preview()).toContain("<p>new viewer</p>");
});
