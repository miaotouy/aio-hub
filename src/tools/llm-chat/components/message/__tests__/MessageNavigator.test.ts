import { mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import ElementPlus from "element-plus";
import MessageNavigator from "../MessageNavigator.vue";
vi.mock("@vueuse/core", () => ({
  useScroll: () => ({ arrivedState: { top: false, bottom: false } }),
  useThrottleFn: (fn: () => void) => fn,
}));
it("one long question still has a keyboard-accessible navigation point that targets the original user node", async () => {
  const wrapper = mount(MessageNavigator, {
    props: {
      scrollElement: null,
      compact: true,
      messageCount: 1,
      currentIndex: 1,
      points: [
        {
          id: "question",
          anchorNodeId: "user-node",
          label: "如何整理消息列表？",
          startNodeId: "user-node",
          endNodeId: "last-tool",
        },
      ],
    },
    global: { plugins: [ElementPlus] },
  });
  try {
    const point = wrapper.get('button[aria-current="step"]');
    expect(point.attributes("aria-label")).toContain("如何整理消息列表？");
    await point.trigger("click");
    expect(wrapper.emitted("navigate")).toEqual([["user-node"]]);
    await wrapper.get('button[aria-label="跳转到底部"]').trigger("click");
    expect(wrapper.emitted("scroll-to-bottom")).toHaveLength(1);
  } finally {
    wrapper.unmount();
  }
});
