import { shallowMount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ModelEditDialog from "../ModelEditDialog.vue";

vi.mock("@/composables/useThemeAppearance", () => ({
  useThemeAppearance: () => ({ appearanceSettings: ref({}) }),
}));
vi.mock("@/composables/useModelMetadata", () => ({
  useModelMetadata: () => ({ materializeModel: vi.fn() }),
}));
vi.mock("@/config/preset-icons", () => ({
  PRESET_ICONS: [{ name: "OpenAI", path: "/icons/openai.svg" }],
}));
vi.mock("@/components/common/RichCodeEditor.vue", () => ({ default: {} }));
vi.mock(
  "@/tools/agent-manager/components/parameters/PostProcessingPanel.vue",
  () => ({ default: {} })
);
vi.mock(
  "@/views/Settings/model-metadata/components/MediaGenParamsEditor.vue",
  () => ({ default: {} })
);

const wrappers: ReturnType<typeof shallowMount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

function mountDialog() {
  const wrapper = shallowMount(ModelEditDialog, {
    props: {
      visible: true,
      isEditing: true,
      model: { id: "test-model", name: "Test Model" },
    },
    global: {
      plugins: [ElementPlus],
      components: { BaseDialog },
      stubs: {
        BaseDialog: false,
        ElInput: false,
        ElButton: false,
        IconPresetSelector: false,
        teleport: true,
      },
      renderStubDefaultSlot: true,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function buttonWithText(wrapper: ReturnType<typeof mountDialog>, text: string) {
  const button = wrapper
    .findAll("button")
    .find((button) => button.text() === text);
  expect(button, `Expected button: ${text}`).toBeDefined();
  return button!;
}

describe("ModelEditDialog icon presets", () => {
  it("opens the picker and saves the chosen icon through the model form", async () => {
    const wrapper = mountDialog();
    await buttonWithText(wrapper, "选择预设").trigger("click");

    await wrapper
      .get('.preset-item[title="/icons/openai.svg"]')
      .trigger("click");
    expect(wrapper.find(".icon-preset-selector").exists()).toBe(false);
    expect(
      wrapper.get<HTMLInputElement>(
        'input[placeholder="可选，自定义图标路径或选择预设"]'
      ).element.value
    ).toBe("/icons/openai.svg");

    await buttonWithText(wrapper, "确定").trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      id: "test-model",
      icon: "/icons/openai.svg",
    });
  });

  it("closes the picker along with the model editor", async () => {
    const wrapper = mountDialog();
    await buttonWithText(wrapper, "选择预设").trigger("click");
    expect(wrapper.find(".icon-preset-selector").exists()).toBe(true);

    await wrapper.setProps({ visible: false });
    expect(wrapper.find(".icon-preset-selector").exists()).toBe(false);
  });
});
