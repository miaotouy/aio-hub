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

// Deleting the current part keeps editing nearby, for both middle and last positions.
it.each([
  [1, "part-2"],
  [2, "part-1"],
])(
  "selects an adjacent part after deleting index %i",
  async (index, expectedId) => {
    const parts = [0, 1, 2].map((i) => ({
      id: `part-${i}`,
      kind: "choice" as const,
      selectedOptionId: `version-${i}`,
      options: [{ id: `version-${i}`, content: `body-${i}` }],
    }));
    const wrapper = shallowMount(PresetCompositionEditor, {
      props: {
        modelValue: { version: 1 as const, separator: "", parts },
        initialPartId: parts[index].id,
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
          ElTooltip: true,
          ElTag: true,
          ElInput: true,
          ElRadioButton: true,
          ElRadioGroup: true,
          ElPopconfirm: true,
          ElButton: { template: "<button><slot /></button>" },
        },
      },
    });
    try {
      wrapper
        .findAllComponents({ name: "ElPopconfirm" })[0]
        .vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      expect(
        wrapper.get(".part-item.active .part-index").attributes("aria-current")
      ).toBe("true");
      expect(wrapper.findComponent(RichCodeEditor).props("modelValue")).toBe(
        `body-${expectedId.slice(-1)}`
      );
      expect(wrapper.props("modelValue").parts.map((part) => part.id)).toEqual(
        parts.filter((_, i) => i !== index).map((part) => part.id)
      );
    } finally {
      wrapper.unmount();
    }
  }
);
