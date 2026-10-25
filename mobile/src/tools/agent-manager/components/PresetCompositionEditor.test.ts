// @vitest-environment jsdom
import { shallowMount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import PresetCompositionEditor from "./PresetCompositionEditor.vue";
import type { PresetComposition } from "@aiohub/agent-preset-core";
vi.mock("@/i18n", () => ({ useI18n: () => ({ tRaw: (key: string) => key }) }));
vi.mock("@/utils/feedback", () => ({ customDialog: vi.fn() }));

// Protects the mobile editor's v-model wiring: undoing participation preserves later typing.
it("keeps body and name edits when undoing a participation change", async () => {
  const initial: PresetComposition = {
    version: 1,
    separator: "",
    parts: [{ id: "body", kind: "text", content: "original" }],
  };
  const wrapper = shallowMount(PresetCompositionEditor, {
    props: {
      modelValue: initial,
      "onUpdate:modelValue": (value: PresetComposition) =>
        wrapper.setProps({ modelValue: value }),
    },
  });
  try {
    await wrapper.get('input[type="checkbox"]').setValue(false);
    await wrapper.get(".part-row").trigger("click");
    await wrapper.get("textarea").setValue("latest body");
    await wrapper.get(".block-setting input").setValue("latest name");
    await wrapper.get(".back-button").trigger("click");
    await wrapper.get(".card-heading .ghost-icon").trigger("click");
    expect(wrapper.props("modelValue").parts).toEqual([
      { id: "body", kind: "text", name: "latest name", content: "latest body" },
    ]);
  } finally {
    wrapper.unmount();
  }
});
