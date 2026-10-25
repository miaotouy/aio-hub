import { mount, flushPromises } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import ElementPlus from "element-plus";
import { createPresetPart } from "@aiohub/agent-preset-core";
import AgentPresetBatchDialog from "./AgentPresetBatchDialog.vue";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
vi.mock("@/tools/llm-chat/composables/ui/useAnchorRegistry", () => ({
  useAnchorRegistry: () => ({ getAnchorById: () => undefined }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn() },
}));

// The list preview compiles structure, while applying batch edits retains the persisted representation.
it("previews active composition text without materializing the saved messages", async () => {
  const active = createPresetPart("选中正文");
  active.options.push({ id: "unused", content: "其他版本" });
  const messages = [
    {
      id: "host",
      role: "system",
      content: "",
      presetComposition: {
        version: 1,
        separator: "\n",
        parts: [active, { ...createPresetPart("停用"), enabled: false }],
      },
    },
    { id: "plain", role: "system", content: "普通正文" },
  ] as ChatMessageNode[];
  const before = JSON.stringify(messages);
  const wrapper = mount(AgentPresetBatchDialog, {
    props: { visible: false, messages },
    global: {
      plugins: [ElementPlus],
      stubs: {
        BaseDialog: {
          props: ["modelValue"],
          template:
            '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
        },
      },
    },
  });
  try {
    await wrapper.setProps({ visible: true });
    await flushPromises();
    expect(wrapper.findAll(".content-text").map((row) => row.text())).toEqual([
      "选中正文",
      "普通正文",
    ]);
    await wrapper.findAll(".dialog-footer button")[1].trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toEqual(messages);
    expect(JSON.stringify(messages)).toBe(before);
  } finally {
    wrapper.unmount();
  }
});
