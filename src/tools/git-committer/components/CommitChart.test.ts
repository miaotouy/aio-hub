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

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import CommitChart from "./CommitChart.vue";

const chartMocks = vi.hoisted(() => ({
  clear: vi.fn(),
  dispose: vi.fn(),
  init: vi.fn(),
  resize: vi.fn(),
  setOption: vi.fn(),
}));

vi.mock("echarts", () => ({
  graphic: {
    LinearGradient: class LinearGradient {},
  },
  init: chartMocks.init,
}));

describe("CommitChart", () => {
  it("keeps Vue's empty state outside the element owned by ECharts", async () => {
    chartMocks.clear.mockReset();
    chartMocks.dispose.mockReset();
    chartMocks.init.mockReset();
    chartMocks.resize.mockReset();
    chartMocks.setOption.mockReset();
    chartMocks.init.mockImplementation((element: HTMLElement) => {
      // ECharts mutates the host element. This must not remove Vue-managed nodes.
      element.replaceChildren(document.createElement("canvas"));
      return {
        clear: chartMocks.clear,
        dispose: chartMocks.dispose,
        resize: chartMocks.resize,
        setOption: chartMocks.setOption,
      };
    });

    const wrapper = mount(CommitChart, {
      attachTo: document.body,
      props: { commits: [] },
    });
    await nextTick();

    expect(chartMocks.init).not.toHaveBeenCalled();
    expect(wrapper.find(".empty-tip").exists()).toBe(true);

    await wrapper.setProps({
      commits: [
        {
          hash: "abc123",
          author: "Test User",
          email: "test@example.com",
          date: "2026-09-13T00:00:00.000Z",
          message: "test commit",
        },
      ],
    });
    await nextTick();

    expect(chartMocks.init).toHaveBeenCalledWith(
      wrapper.find(".chart-canvas").element
    );
    expect(wrapper.find(".empty-tip").exists()).toBe(false);

    await wrapper.setProps({ commits: [] });
    await nextTick();

    expect(wrapper.find(".empty-tip").exists()).toBe(true);
    expect(chartMocks.clear).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
