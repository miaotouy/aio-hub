import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { expect, it, vi } from "vitest";
import MessageRow from "../MessageRow.vue";
import type { BubbleLayoutConfig } from "../../../types/settings";
const layout: BubbleLayoutConfig = {
  mode: "card",
  userAlign: "right",
  assistantAlign: "left",
  systemAlign: "center",
  maxWidthPercent: 75,
  maxWidthPx: 720,
  systemMaxWidthPercent: 60,
  toolAttachment: "follow-prev",
  avatarPlacement: "inside",
  avatarSize: 36,
  avatarGap: 8,
  headerPlacement: "inside",
  headerGap: 4,
  borderRadius: 12,
};

vi.mock("../ChatMessage.vue", () => ({
  default: defineComponent({
    props: ["hideHeader"],
    emits: ["edit"],
    setup(_, { emit }) {
      const draft = ref("");
      return () =>
        h("input", {
          value: draft.value,
          onInput: (e: Event) => {
            draft.value = (e.target as HTMLInputElement).value;
            emit("edit", draft.value);
          },
        });
    },
  }),
}));
vi.mock("../CompressionMessage.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("../ToolCallMessage.vue", () => ({ default: { template: "<div />" } }));
vi.mock("../MessageExternalAvatar.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("../MessageHeader.vue", () => ({ default: { template: "<div />" } }));
vi.mock("../MessageGroupFooter.vue", () => ({
  default: { template: "<div />" },
}));

it("切换内外头栏与连续布局时保留正文实例和编辑状态，动作始终转发给源消息", async () => {
  const message = {
    id: "a",
    parentId: null,
    childrenIds: [],
    role: "assistant" as const,
    status: "complete" as const,
    content: "body",
  };
  const edit = vi.fn();
  const row = {
    groupId: "a",
    first: true,
    last: true,
    grouped: false,
    layoutKey: "single",
  };
  const wrapper = mount(MessageRow, {
    props: {
      message,
      messageDepth: 0,
      sessionIndex: null,
      sessionDetail: null,
      isSending: false,
      bubbleLayout: { ...layout },
      layout: { role: "assistant", align: "left" },
      siblingInfo: { siblings: [message], currentIndex: 0 },
      compressed: false,
      showAvatar: true,
      hideHeaderAvatar: false,
      outsideHeader: false,
      presentation: row,
      group: { id: "a", actor: message, members: [message] },
      characterCounts: new Map(),
      actions: { edit },
    },
  });
  try {
    const input = wrapper.get("input");
    await input.setValue("保留草稿");
    await wrapper.setProps({ outsideHeader: true });
    expect(wrapper.get("input").element).toBe(input.element);
    await wrapper.setProps({
      outsideHeader: false,
      bubbleLayout: { ...layout, mode: "compact" },
      presentation: { ...row, first: false, grouped: true },
    });
    expect(wrapper.get("input").element).toBe(input.element);
    expect((input.element as HTMLInputElement).value).toBe("保留草稿");
    expect(edit).toHaveBeenLastCalledWith("保留草稿");
  } finally {
    wrapper.unmount();
  }
});
