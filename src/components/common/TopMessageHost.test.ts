// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TopMessageHost from "./TopMessageHost.vue";
import { closeAllFloatingMessages, customMessage } from "@/utils/customMessage";

describe("TopMessageHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    closeAllFloatingMessages();
  });

  afterEach(() => {
    closeAllFloatingMessages();
    vi.useRealTimers();
  });

  it("pauses the countdown on hover and resumes from the paused point", async () => {
    const wrapper = mount(TopMessageHost);
    customMessage.info({ message: "可暂停的通知", duration: 1000 });
    await nextTick();

    const message = wrapper.get(".top-message");
    vi.advanceTimersByTime(400);
    await nextTick();

    await message.trigger("mouseenter");
    expect(wrapper.text()).not.toMatch(/剩余|倒计时/);

    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(wrapper.find(".top-message").exists()).toBe(true);

    await message.trigger("mouseleave");
    vi.advanceTimersByTime(620);
    await nextTick();
    expect(wrapper.find(".top-message").exists()).toBe(false);
  });

  it("copies the message content when the message card is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const wrapper = mount(TopMessageHost);
    customMessage.success({ message: "需要复制的内容", duration: 0 });
    await nextTick();

    await wrapper.get(".top-message").trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("需要复制的内容");
    expect(wrapper.find("button[aria-label='消息内容已复制']").exists()).toBe(
      true
    );
    expect(wrapper.find("button[aria-label='关闭消息']").exists()).toBe(true);
  });
});
