// @vitest-environment jsdom

import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MessageMenubar from "../MessageMenubar.vue";
import type { ChatMessageNode } from "../../types";
import { mount } from "@vue/test-utils";

const clipboard = vi.hoisted(() => ({
  writeText: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboard);

const VarButtonStub = defineComponent({
  inheritAttrs: false,
  template: '<button v-bind="$attrs"><slot /></button>',
});

const message: ChatMessageNode = {
  id: "message-1",
  parentId: null,
  childrenIds: [],
  role: "assistant",
  status: "complete",
  content: "Copy this message",
};

function mountMenubar() {
  return mount(MessageMenubar, {
    props: { session: null, message },
    global: {
      stubs: {
        "var-button": VarButtonStub,
        BranchSelector: true,
      },
    },
  });
}

beforeEach(() => {
  clipboard.writeText.mockReset();
});

describe("MessageMenubar actions", () => {
  it("emits a reply selection and closes the active action bar", async () => {
    const wrapper = mountMenubar();

    await wrapper.get('[data-testid="message-reply"]').trigger("click");

    expect(wrapper.emitted("reply")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("writes message content through the native clipboard plugin", async () => {
    clipboard.writeText.mockResolvedValue(undefined);
    const wrapper = mountMenubar();

    await wrapper.get('[data-testid="message-copy"]').trigger("click");

    expect(clipboard.writeText).toHaveBeenCalledWith("Copy this message");
    expect(wrapper.emitted("copy")).toHaveLength(1);
    expect(wrapper.emitted("copy-error")).toBeUndefined();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("reports a failed native clipboard write without a false success event", async () => {
    clipboard.writeText.mockRejectedValue(new Error("clipboard denied"));
    const wrapper = mountMenubar();

    await wrapper.get('[data-testid="message-copy"]').trigger("click");

    expect(wrapper.emitted("copy")).toBeUndefined();
    expect(wrapper.emitted("copy-error")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
