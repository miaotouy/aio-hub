// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import ConfigImportPanel from "../ConfigImportPanel.vue";
import CreateProfileDialog from "../CreateProfileDialog.vue";

vi.mock("@/composables/useModelMetadata", () => ({
  useModelMetadata: () => ({
    getDisplayIconPath: (path: string) => path,
    getIconPath: () => "",
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const SegmentedStub = defineComponent({
  name: "ElSegmented",
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template: `
    <div class="segmented-stub">
      <button
        v-for="option in options"
        :key="option.value"
        :data-value="option.value"
        @click="$emit('update:modelValue', option.value)"
      >{{ option.label }}</button>
    </div>
  `,
});

const InputStub = defineComponent({
  name: "ElInput",
  inheritAttrs: false,
  props: ["modelValue", "type"],
  emits: ["update:modelValue"],
  template: `
    <textarea
      v-if="type === 'textarea'"
      class="input-stub textarea-stub"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <input
      v-else
      class="input-stub"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
});

const ButtonStub = defineComponent({
  name: "ElButton",
  props: ["disabled", "type", "text", "circle"],
  emits: ["click"],
  template:
    '<button class="button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
});

const CheckboxStub = defineComponent({
  name: "ElCheckbox",
  props: ["modelValue", "disabled"],
  emits: ["change"],
  template: `
    <input
      class="checkbox-stub"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('change', $event.target.checked)"
    />
  `,
});

const RadioStub = defineComponent({
  name: "ElRadio",
  props: ["modelValue", "value", "disabled"],
  emits: ["change"],
  template: `
    <input
      class="radio-stub"
      type="radio"
      :checked="modelValue === value"
      :disabled="disabled"
      @change="$emit('change', value)"
    />
  `,
});

const commonStubs = {
  ElSegmented: SegmentedStub,
  ElInput: InputStub,
  ElButton: ButtonStub,
  ElCheckbox: CheckboxStub,
  ElRadio: RadioStub,
  ElTooltip: { template: "<div><slot /></div>" },
  ElSelect: {
    props: ["modelValue"],
    template: '<select class="select-stub"><slot /></select>',
  },
  ElOption: { template: "<option />" },
};

describe("ConfigImportPanel", () => {
  it("shows all formats and keeps multi-provider candidates selectable", async () => {
    const wrapper = mount(ConfigImportPanel, {
      global: { stubs: commonStubs },
    });

    expect(
      wrapper.findAll(".segmented-stub button").map((item) => item.text())
    ).toEqual(["自动检测", "cURL", "环境变量", "JSON", "TOML"]);

    const config = JSON.stringify({
      provider: {
        anthropic: {
          options: {
            baseURL: "https://proxy.example.com/antigravity/v1",
            apiKey: "claude-secret",
          },
        },
        gemini: {
          options: {
            baseURL: "https://proxy.example.com/antigravity/v1beta",
            apiKey: "gemini-secret",
          },
        },
      },
    });
    await wrapper.find(".textarea-stub").setValue(config);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(wrapper.findAll(".candidate-card")).toHaveLength(2);
    expect(wrapper.find(".selection-summary").text()).toContain("0");

    await wrapper.findAll(".checkbox-stub")[0].setValue(true);
    expect(wrapper.find(".selection-summary").text()).toContain("1");

    const importButton = wrapper
      .findAll(".button-stub")
      .find((button) => button.text().includes("创建选中渠道"));
    expect(importButton).toBeDefined();
    await importButton!.trigger("click");
    expect(wrapper.emitted("import")?.[0]?.[0]).toHaveLength(1);
  });
});

describe("CreateProfileDialog", () => {
  it("opens on presets, preserves the active session, and resets after reopen", async () => {
    const wrapper = mount(CreateProfileDialog, {
      props: { visible: true },
      global: {
        stubs: {
          ...commonStubs,
          BaseDialog: {
            template: '<div class="dialog-stub"><slot name="content" /></div>',
          },
          ConfigImportPanel: { template: '<div class="config-panel-stub" />' },
          DynamicIcon: { template: "<span />" },
        },
      },
    });

    expect(
      wrapper.find(".preset-options").attributes("style") || ""
    ).not.toContain("display: none");
    expect(wrapper.find(".config-panel-stub").attributes("style")).toContain(
      "display: none"
    );

    (wrapper.vm.$ as any).setupState.creationMode = "import";
    await nextTick();
    expect(wrapper.find(".preset-options").attributes("style")).toContain(
      "display: none"
    );
    expect(
      wrapper.find(".config-panel-stub").attributes("style") || ""
    ).not.toContain("display: none");

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(
      wrapper.find(".preset-options").attributes("style") || ""
    ).not.toContain("display: none");
    expect(wrapper.find(".config-panel-stub").attributes("style")).toContain(
      "display: none"
    );
  });
});
