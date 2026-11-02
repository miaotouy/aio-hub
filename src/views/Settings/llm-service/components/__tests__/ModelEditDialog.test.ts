import { shallowMount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ModelEditDialog from "../ModelEditDialog.vue";
import type { LlmModelInfo } from "@/types/llm-profiles";

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

function mountDialog(
  model: LlmModelInfo = { id: "test-model", name: "Test Model" }
) {
  const wrapper = shallowMount(ModelEditDialog, {
    props: {
      visible: true,
      isEditing: true,
      model,
    },
    global: {
      plugins: [ElementPlus],
      components: { BaseDialog },
      stubs: {
        BaseDialog: false,
        ElInput: false,
        ElButton: false,
        ElCollapse: false,
        ElCollapseItem: false,
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

// Protect progressive disclosure and the save contract for hidden, pre-existing settings.
describe("ModelEditDialog advanced settings", () => {
  const model: LlmModelInfo = {
    id: "gemini-embedding-2",
    name: "Gemini Embedding 2",
    capabilities: { embedding: true },
    modelIdentity: {
      canonicalId: "google/gemini-embedding-2",
      revision: "2026-01",
      source: "provider",
    },
    routing: {
      supportedEndpointTypes: ["openai", "gemini"],
      bindings: {
        embedding: {
          adapterId: "openai-embeddings",
          endpoint: "/v1/embeddings",
          source: "manual",
        },
      },
    },
  };

  it("starts collapsed and resets expanded sections when reopened or switching models", async () => {
    const wrapper = mountDialog(model);
    const headers = () =>
      wrapper.findAll(".model-advanced-collapse [role=button][aria-expanded]");
    expect(headers()).toHaveLength(2);
    expect(
      headers().map((header) => header.attributes("aria-expanded"))
    ).toEqual(["false", "false"]);

    await headers()[0].trigger("keydown", { key: "Enter" });
    expect(headers()[0].attributes("aria-expanded")).toBe("true");
    await headers()[1].trigger("click");
    expect(headers()[1].attributes("aria-expanded")).toBe("true");

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(
      headers().map((header) => header.attributes("aria-expanded"))
    ).toEqual(["false", "false"]);

    await headers()[1].trigger("click");
    await wrapper.setProps({
      model: { id: "other-model", name: "Other Model" },
    });
    expect(headers()).toHaveLength(1);
    expect(headers()[0].attributes("aria-expanded")).toBe("false");
  });

  it("preserves identity, version, and route settings when saving with sections collapsed", async () => {
    const wrapper = mountDialog(model);
    await buttonWithText(wrapper, "确定").trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      id: model.id,
      modelIdentity: model.modelIdentity,
      routing: model.routing,
    });
  });
});
