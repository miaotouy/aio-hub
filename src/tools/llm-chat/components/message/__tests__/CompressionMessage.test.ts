import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import CompressionMessage from "../CompressionMessage.vue";
import type { ChatMessageNode } from "../../../types";

vi.mock("../../../composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: ref(null) }),
}));
vi.mock("../../../composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: ref({ uiPreferences: {}, regexConfig: { rules: [] } }),
  }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: () => undefined }),
}));
vi.mock("../../../stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ getEffectiveProfile: () => undefined }),
}));
vi.mock("../../../utils/chatRegexUtils", () => ({
  resolveRawRules: () => [],
  filterRulesByRole: () => [],
  filterRulesByDepth: () => [],
  processRulesWithMacros: async () => [],
}));
vi.mock("../../../macro-engine/MacroContext", () => ({
  createMacroContext: () => ({}),
}));
vi.mock("@/tools/rich-text-renderer/RichTextRenderer.vue", () => ({
  default: { props: ["content"], template: "<div>{{ content }}</div>" },
}));

const message: ChatMessageNode = {
  id: "summary",
  parentId: null,
  childrenIds: [],
  role: "system",
  status: "complete",
  content: "保留关键历史的摘要",
  isEnabled: true,
  metadata: { isCompressionNode: true, originalMessageCount: 4 },
};

function renderMessage(
  props: {
    readonly?: boolean;
    screenshotMode?: boolean;
    isEnabled?: boolean;
  } = {},
  sessionReadOnly = false
) {
  const { isEnabled = true, ...viewProps } = props;
  return mount(CompressionMessage, {
    props: {
      sessionIndex: null,
      sessionDetail: null,
      message: { ...message, isEnabled },
      ...viewProps,
    },
    global: {
      provide: { isSessionReadOnly: computed(() => sessionReadOnly) },
      stubs: {
        ElDropdown: { template: "<div><slot /></div>" },
        ElDropdownMenu: true,
        ElDropdownItem: true,
        ElPopconfirm: { template: "<div><slot name='reference' /></div>" },
      },
    },
  });
}

describe("压缩摘要的展示与上下文开关", () => {
  it.each([true, false])(
    "侧栏与标题共同控制摘要展示，保持上下文启用状态 %s",
    async (isEnabled) => {
      const wrapper = renderMessage({ isEnabled });
      try {
        const bar = wrapper.get(".compression-bar");
        const heading = wrapper.get(".summary-toggle");
        expect(wrapper.find(".compression-summary").exists()).toBe(false);
        await bar.trigger("click");
        expect(wrapper.get(".compression-summary").text()).toBe(
          message.content
        );
        expect(bar.attributes("aria-expanded")).toBe("true");
        expect(heading.attributes("aria-expanded")).toBe("true");
        expect(bar.attributes("aria-controls")).toBe(
          wrapper.get(".compression-summary").attributes("id")
        );
        await heading.trigger("click");
        expect(wrapper.find(".compression-summary").exists()).toBe(false);
        await heading.trigger("click");
        await bar.trigger("click");
        expect(wrapper.find(".compression-summary").exists()).toBe(false);
        expect(bar.attributes("aria-expanded")).toBe("false");
        expect(heading.attributes("aria-expanded")).toBe("false");
        expect(wrapper.emitted("toggle-enabled")).toBeUndefined();
        expect(wrapper.props("message").isEnabled).toBe(isEnabled);
      } finally {
        wrapper.unmount();
      }
    }
  );

  it("独立开关切换上下文状态时保留摘要的展示状态", async () => {
    const wrapper = renderMessage();
    try {
      const toggle = wrapper.get("button[aria-pressed]");
      expect(toggle.attributes("aria-pressed")).toBe("true");
      await toggle.trigger("click");
      expect(wrapper.emitted("toggle-enabled")).toEqual([[]]);
      await wrapper.setProps({ message: { ...message, isEnabled: false } });
      expect(toggle.attributes("aria-pressed")).toBe("false");
      expect(wrapper.find(".compression-summary").exists()).toBe(false);
      await wrapper.get(".compression-bar").trigger("click");
      await toggle.trigger("click");
      expect(wrapper.emitted("toggle-enabled")).toHaveLength(2);
      expect(wrapper.get(".compression-summary").text()).toBe(message.content);
    } finally {
      wrapper.unmount();
    }
  });

  it.each(["message", "session"])(
    "%s 只读状态下仍可展开查看摘要，写操作保持隐藏",
    async (source) => {
      const wrapper = renderMessage(
        { readonly: source === "message" },
        source === "session"
      );
      try {
        const bar = wrapper.get(".compression-bar");
        expect(bar.attributes("disabled")).toBeUndefined();
        await bar.trigger("click");
        expect(wrapper.get(".compression-summary").text()).toBe(
          message.content
        );
        await bar.trigger("click");
        expect(wrapper.find(".compression-summary").exists()).toBe(false);
        expect(wrapper.emitted("toggle-enabled")).toBeUndefined();
        expect(wrapper.find(".header-right button").exists()).toBe(false);
      } finally {
        wrapper.unmount();
      }
    }
  );

  it("截图模式保持摘要展开且侧栏禁用", async () => {
    const wrapper = renderMessage({ screenshotMode: true });
    try {
      const bar = wrapper.get(".compression-bar");
      expect(bar.attributes("disabled")).toBeDefined();
      expect(bar.attributes("aria-expanded")).toBe("true");
      await bar.trigger("click");
      expect(wrapper.get(".compression-summary").text()).toBe(message.content);
      expect(wrapper.emitted("toggle-enabled")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
});
