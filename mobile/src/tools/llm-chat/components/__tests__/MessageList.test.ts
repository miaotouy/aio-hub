// @vitest-environment jsdom

import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageList from "../MessageList.vue";
import type { ChatMessageNode } from "../../types";

const ChatMessageStub = defineComponent({
  name: "ChatMessage",
  props: {
    message: { type: Object, required: true },
    isActive: { type: Boolean, default: false },
  },
  emits: ["click"],
  template:
    '<button data-testid="message-activate" @click.stop="$emit(\'click\')">{{ isActive ? "active" : "inactive" }}</button>',
});

const message: ChatMessageNode = {
  id: "message-1",
  parentId: null,
  childrenIds: [],
  role: "assistant",
  status: "complete",
  content: "Message content",
};

describe("MessageList", () => {
  it("activates a message after ChatMessage emits its click event", async () => {
    const wrapper = mount(MessageList, {
      props: { messages: [message] },
      global: { stubs: { ChatMessage: ChatMessageStub } },
    });

    expect(wrapper.get('[data-testid="message-activate"]').text()).toBe(
      "inactive"
    );
    await wrapper.get('[data-testid="message-activate"]').trigger("click");

    expect(wrapper.get('[data-testid="message-activate"]').text()).toBe(
      "active"
    );
  });
});
