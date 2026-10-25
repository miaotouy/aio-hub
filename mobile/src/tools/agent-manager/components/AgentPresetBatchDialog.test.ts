// @vitest-environment jsdom
import { shallowMount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { createPresetPart } from "@aiohub/agent-preset-core";
import AgentPresetBatchDialog from "./AgentPresetBatchDialog.vue";
import type { PresetMessage } from "../types/agent";
vi.mock("@/i18n", () => ({
  useI18n: () => ({ tRaw: (key: string) => key.split(".").pop() }),
}));

// Batch preview must consume the active compiled body while preserving the stored structure.
it("previews active composition text and applies actions by message identity", async () => {
  const active = createPresetPart("选中正文");
  active.options.push({ id: "unused", content: "其他版本" });
  const messages = [
    {
      id: "host",
      content: "",
      name: "组合",
      presetComposition: {
        version: 1,
        separator: "\n",
        parts: [active, { ...createPresetPart("停用"), enabled: false }],
      },
    },
    { id: "plain", content: "普通正文" },
  ] as PresetMessage[];
  const before = JSON.stringify(messages);
  const wrapper = shallowMount(AgentPresetBatchDialog, {
    props: { open: true, messages, groups: [] },
  });
  try {
    expect(wrapper.findAll(".message small").map((row) => row.text())).toEqual([
      "选中正文",
      "普通正文",
    ]);
    await wrapper.get('.message input[type="checkbox"]').setValue(true);
    await wrapper.findAll(".actions button")[1].trigger("click");
    expect(wrapper.emitted("apply")?.[0]).toEqual([
      ["host"],
      "enable",
      undefined,
    ]);
    expect(JSON.stringify(messages)).toBe(before);
  } finally {
    wrapper.unmount();
  }
});
