// @vitest-environment jsdom

import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MessageList from "../MessageList.vue";
import type { ChatMessageNode } from "../../types";

const ChatMessageStub = defineComponent({
  name: "ChatMessage",
  props: {
    message: { type: Object, required: true },
    isActive: { type: Boolean, default: false },
    fontSize: { type: Number, default: 1 },
  },
  emits: ["click"],
  template:
    '<button data-testid="message-activate" :data-font-size="fontSize" @click.stop="$emit(\'click\')">{{ isActive ? "active" : "inactive" }}</button>',
});

const message: ChatMessageNode = {
  id: "message-1",
  parentId: null,
  childrenIds: [],
  role: "assistant",
  status: "complete",
  content: "Message content",
};

const MessageNavigatorStub = defineComponent({
  name: "MessageNavigator",
  props: {
    currentIndex: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  emits: ["top", "previous", "next", "bottom"],
  template:
    '<div data-testid="navigator" :data-current="currentIndex" :data-total="total" />',
});

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

  it("forwards the configured font scale to every message", () => {
    const wrapper = mount(MessageList, {
      props: { messages: [message], fontSize: 1.3 },
      global: { stubs: { ChatMessage: ChatMessageStub } },
    });

    expect(
      wrapper
        .get('[data-testid="message-activate"]')
        .attributes("data-font-size")
    ).toBe("1.3");
  });

  it("renders the navigator only when the persisted UI preference enables it", () => {
    const messages = [
      message,
      { ...message, id: "message-2", content: "Second message" },
    ];

    const disabled = mount(MessageList, {
      props: { messages, showNavigator: false },
      global: {
        stubs: {
          ChatMessage: ChatMessageStub,
          MessageNavigator: MessageNavigatorStub,
        },
      },
    });
    expect(disabled.find('[data-testid="navigator"]').exists()).toBe(false);

    const enabled = mount(MessageList, {
      props: { messages, showNavigator: true },
      global: {
        stubs: {
          ChatMessage: ChatMessageStub,
          MessageNavigator: MessageNavigatorStub,
        },
      },
    });
    expect(enabled.get('[data-testid="navigator"]').attributes()).toMatchObject(
      {
        "data-current": "1",
        "data-total": "2",
      }
    );
  });

  it("does not scroll for message changes when automatic scrolling is disabled", async () => {
    const wrapper = mount(MessageList, {
      props: { messages: [message], autoScroll: false },
      global: { stubs: { ChatMessage: ChatMessageStub } },
    });
    const container = wrapper.get(".message-scroll-container")
      .element as HTMLElement & {
      scrollTo: ReturnType<typeof vi.fn>;
    };
    const scrollTo = vi.fn();
    Object.defineProperty(container, "scrollTo", { value: scrollTo });

    await wrapper.setProps({
      messages: [{ ...message, content: "Updated message content" }],
    });
    await Promise.resolve();

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
