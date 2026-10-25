import { shallowMount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import PresetCompositionEditor from "./PresetCompositionEditor.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import type { PresetComposition } from "@aiohub/agent-preset-core";

vi.mock("@/components/common/RichCodeEditor.vue", () => ({
  default: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<div />",
  },
}));
vi.mock("./PresetBodyToolbar.vue", () => ({
  default: { inheritAttrs: false },
}));

// Protects the editor's public v-model contract: structural undo retains later typing.
// Uses UI events and model output, independent of history storage or editor implementation.
it("keeps later body edits when undoing participation and order changes", async () => {
  const initial: PresetComposition = {
    version: 1,
    separator: "",
    parts: [
      {
        id: "body",
        kind: "choice",
        selectedOptionId: "body-version",
        options: [{ id: "body-version", content: "original" }],
      },
      {
        id: "tail",
        kind: "choice",
        selectedOptionId: "tail-version",
        options: [{ id: "tail-version", content: "tail" }],
      },
    ],
  };
  const wrapper = shallowMount(PresetCompositionEditor, {
    props: {
      modelValue: initial,
      "onUpdate:modelValue": (value: PresetComposition) =>
        wrapper.setProps({ modelValue: value }),
    },
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        PresetBodyToolbar: {
          props: ["editor", "modelValue", "variableConfig", "allowRecall"],
          template: "<div />",
        },
        ElTag: true,
        ElTooltip: true,
        ElPopconfirm: true,
        ElInput: true,
        ElRadioButton: true,
        ElRadioGroup: true,
        ElButton: {
          props: ["disabled"],
          template: '<button :disabled="disabled"><slot /></button>',
        },
      },
    },
  });
  try {
    await wrapper.get('input[type="checkbox"]').setValue(false);
    await wrapper
      .findComponent(RichCodeEditor)
      .vm.$emit("update:modelValue", "typed after toggle");
    await wrapper.get('[aria-label="下移片段"]').trigger("click");
    await wrapper
      .findComponent(RichCodeEditor)
      .vm.$emit("update:modelValue", "latest body");
    await wrapper.get('[aria-label="撤销结构调整"]').trigger("click");
    expect(wrapper.props("modelValue").parts).toEqual([
      {
        id: "body",
        enabled: false,
        kind: "choice",
        selectedOptionId: "body-version",
        options: [{ id: "body-version", content: "latest body" }],
      },
      initial.parts[1],
    ]);
    await wrapper.get('[aria-label="撤销结构调整"]').trigger("click");
    expect(wrapper.props("modelValue").parts).toEqual([
      {
        id: "body",
        kind: "choice",
        selectedOptionId: "body-version",
        options: [{ id: "body-version", content: "latest body" }],
      },
      initial.parts[1],
    ]);
  } finally {
    wrapper.unmount();
  }
});
