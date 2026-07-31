// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatMessage from "../ChatMessage.vue";
import type { ChatMessageNode } from "../../types";

const settings = vi.hoisted(() => ({
  uiPreferences: {
    showModelInfo: true,
    showTimestamp: true,
    showTokenCount: false,
  },
}));

vi.mock("../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({ currentSession: null }),
}));
vi.mock("../../composables/useChatSettings", () => ({
  useChatSettings: () => ({ settings }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    tRaw: (key: string) => key,
    locale: { value: "en-US" },
  }),
}));

const message: ChatMessageNode = {
  id: "message-1",
  parentId: null,
  childrenIds: [],
  role: "assistant",
  status: "complete",
  content: "Answer",
  timestamp: "2026-07-26T10:15:00.000Z",
  metadata: {
    modelDisplayName: "Example model",
  },
};

function mountMessage(fontSize = 1) {
  return mount(ChatMessage, {
    props: { message, fontSize },
    global: {
      stubs: {
        MessageContent: {
          props: ["message"],
          template: '<div data-testid="message-content" />',
        },
        MessageMenubar: true,
        BranchSwitcher: true,
      },
    },
  });
}

describe("ChatMessage UI preferences", () => {
  it("shows the model and timestamp when enabled and applies the font scale", () => {
    settings.uiPreferences.showModelInfo = true;
    settings.uiPreferences.showTimestamp = true;

    const wrapper = mountMessage(1.25);

    expect(wrapper.find(".model-info").text()).toBe("Example model");
    expect(
      wrapper.get('[data-testid="chat-message-timestamp"]').text()
    ).toContain("2026");
    expect(wrapper.attributes("style")).toContain(
      "--chat-message-font-scale: 1.25"
    );
  });

  it("hides optional model and timestamp metadata when their preferences are disabled", () => {
    settings.uiPreferences.showModelInfo = false;
    settings.uiPreferences.showTimestamp = false;

    const wrapper = mountMessage();

    expect(wrapper.find(".model-info").exists()).toBe(false);
    expect(
      wrapper.find('[data-testid="chat-message-timestamp"]').exists()
    ).toBe(false);
  });
});
