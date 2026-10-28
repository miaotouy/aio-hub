// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import katex from "katex";
import KatexRenderer from "../KatexRenderer.vue";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Protect latest-output delivery during bursts, completion and removal; observe the actual render boundary.
it("merges pending formula updates and immediately commits the completed formula", async () => {
  vi.useFakeTimers();
  const render = vi.spyOn(katex, "render");
  const wrapper = mount(KatexRenderer, {
    props: { content: "x", nodeStatus: "pending" },
  });
  wrappers.push(wrapper);
  expect(wrapper.find(".katex").exists()).toBe(true);
  render.mockClear();
  await wrapper.setProps({ content: "x+1" });
  await wrapper.setProps({ content: "x+2" });
  await vi.advanceTimersByTimeAsync(32);
  expect(render).toHaveBeenCalledTimes(1);
  expect(render.mock.calls[0][0]).toBe("x+2");
  await wrapper.setProps({ content: "x+3" });
  await wrapper.setProps({ nodeStatus: "stable" });
  expect(render).toHaveBeenCalledTimes(2);
  expect(render.mock.calls[1][0]).toBe("x+3");
  await wrapper.setProps({ displayMode: true });
  expect(wrapper.classes()).toContain("katex-block-container");
  expect(render.mock.calls[render.mock.calls.length - 1][2]?.displayMode).toBe(
    true
  );
  expect(wrapper.find("math").exists()).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(render).toHaveBeenCalledTimes(3);
  await wrapper.setProps({ nodeStatus: "pending", content: "x+4" });
  wrapper.unmount();
  await vi.runAllTimersAsync();
  expect(render).toHaveBeenCalledTimes(3);
});
