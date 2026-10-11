import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmParameters } from "@/tools/llm-chat/types";

// 保护跨页参数保留、旧配置启用状态与模型能力契约，避免只检查文案或组件实现。
const mocks = vi.hoisted(() => ({
  profiles: [] as any[],
  sidebarState: {} as Record<string, any>,
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    enabledProfiles: { value: mocks.profiles },
    getSupportedParameters: (provider: string) => ({
      temperature: true,
      maxTokens: true,
      topP: true,
      thinkingConfig: provider === "gemini",
      safetySettings: provider === "gemini",
    }),
  }),
}));
vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => mocks.sidebarState,
}));
vi.mock("@/llm-apis/request-builder", () => ({
  getModelFamily: (id: string) =>
    id.toLowerCase().includes("gemini") ? "gemini" : "openai",
}));

vi.mock("@/components/common/RichCodeEditor.vue", () => ({ default: { template: "<div />" } }));

const ModelParametersEditor = (await import("../ModelParametersEditor.vue"))
  .default;
const ModelConfigSection = (
  await import("../../agent-editor/sections/ModelConfigSection.vue")
).default;
const ConfigSection = (
  await import("@/tools/llm-chat/components/common/ConfigSection.vue")
).default;
const ParameterItem = (await import("../ParameterItem.vue")).default;
const CompressionPanel = (await import("../ContextCompressionConfigPanel.vue"))
  .default;
const wrappers: ReturnType<typeof mount>[] = [];
const stubs = {
  LlmModelSelector: true,
  ParameterItem: {
    name: "ParameterItem",
    props: ["config", "modelValue", "enabled"],
    emits: ["update:modelValue", "update:enabled"],
    template: `<div><input :data-parameter="config.key" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" /></div>`,
  },
  ContextCompressionConfigPanel: {
    name: "ContextCompressionConfigPanel",
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<div />",
  },
  PostProcessingPanel: true,
  SafetySettingsPanel: true,
  CustomParamsPanel: true,
  ContextStatsCard: true,
  "el-form-item": { template: "<div><slot /></div>" },
  "el-switch": true,
  "el-slider": true,
  "el-select": true,
  "el-input-number": true,
  "el-option": true,
  "i-ep-arrow-down": true,
};

function form(parameters: LlmParameters) {
  return reactive({
    profileId: "profile",
    modelId: "budget-model",
    modelCombo: "profile:budget-model",
    parameters,
  });
}
function section(
  draft: ReturnType<typeof form>,
  page: "model" | "context" = "model"
) {
  const wrapper = mount(ModelConfigSection, {
    props: { page },
    global: { provide: { "agent-edit-form": draft }, stubs },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});
beforeEach(() => {
  mocks.profiles = [
    {
      id: "profile",
      type: "openai",
      models: [
        {
          id: "budget-model",
          capabilities: { thinking: true, thinkingConfigType: "budget" },
          tokenLimits: { output: 32768, contextLength: 128000 },
        },
        {
          id: "effort-model",
          capabilities: {
            thinking: true,
            thinkingConfigType: "effort",
            reasoningEffortOptions: ["low", "high"],
          },
        },
        {
          id: "gemini-model",
          capabilities: { thinking: true, thinkingConfigType: "budget" },
        },
      ],
    },
  ];
  for (const key of [
    "basicParamsExpanded",
    "advancedParamsExpanded",
    "contextManagementExpanded",
    "contextCompressionExpanded",
    "postProcessingExpanded",
    "safetySettingsExpanded",
    "specialFeaturesExpanded",
    "customParamsExpanded",
  ])
    mocks.sidebarState[key] = ref(false);
});

describe("shared agent parameter editing", () => {
  it("retains values, enabled keys and hidden configuration across both pages", async () => {
    const draft = form({
      temperature: 0.4,
      maxTokens: 8192,
      enabledParameters: ["temperature", "maxTokens"],
      custom: { enabled: true, params: { nested: { value: 7 } } },
      contextPostProcessing: {
        rules: [{ type: "post:merge-system-to-head", enabled: true }],
      },
    });
    const wrapper = section(draft);
    await wrapper.get("[data-parameter=temperature]").setValue("0.9");
    await wrapper.setProps({ page: "context" });
    const compression = wrapper.getComponent(CompressionPanel);
    compression.vm.$emit("update:modelValue", {
      ...compression.props("modelValue"),
      enabled: true,
      summaryPrompt: "custom summary",
      summaryModel: { profileId: "profile", modelId: "effort-model" },
    });
    await flushPromises();
    await wrapper.setProps({ page: "model" });
    expect(draft.parameters).toMatchObject({
      temperature: 0.9,
      enabledParameters: ["temperature", "maxTokens"],
      custom: { params: { nested: { value: 7 } } },
      contextCompression: {
        enabled: true,
        summaryPrompt: "custom summary",
        summaryModel: { modelId: "effort-model" },
      },
      contextPostProcessing: {
        rules: [{ type: "post:merge-system-to-head", enabled: true }],
      },
    });
  });

  it("infers enabled keys for legacy parameters and applies budget linkage only to the draft", async () => {
    const original = {
      temperature: 0.4,
      maxTokens: 8192,
      thinkingEnabled: true,
      thinkingBudget: 4096,
    };
    const draft = form(JSON.parse(JSON.stringify(original)));
    const wrapper = section(draft);
    expect(
      wrapper
        .findAllComponents(ParameterItem)
        .find((item) => item.props("config").key === "temperature")!
        .props("enabled")
    ).toBe(true);
    await wrapper.get("[data-parameter=thinkingBudget]").setValue("8192");
    await flushPromises();
    expect(draft.parameters.maxTokens).toBe(12288);
    expect(draft.parameters.enabledParameters).toContain("temperature");
    expect(original.maxTokens).toBe(8192);
    draft.modelId = "effort-model";
    await flushPromises();
    const controls = wrapper
      .findAllComponents(ParameterItem)
      .map((item) => item.props("config").key);
    expect(controls).toContain("reasoningEffort");
    expect(controls).not.toContain("thinkingBudget");
    expect(draft.parameters.thinkingBudget).toBe(8192);
  });

  it("keeps settings expansion independent and reveals a collapsed parameter group", async () => {
    const wrapper = section(form({ temperature: 0.4, maxTokens: 8192 }));
    const editor = wrapper.getComponent(ModelParametersEditor);
    const basic = wrapper
      .findAllComponents(ConfigSection)
      .find(
        (item) => item.attributes("data-setting-id") === "parameters.basic"
      )!;
    expect(basic.props("expanded")).toBe(true);
    await basic.get(".config-section-header").trigger("click");
    expect(basic.props("expanded")).toBe(false);
    await editor.vm.revealSetting("parameters.temperature");
    expect(basic.props("expanded")).toBe(true);
    expect(mocks.sidebarState.basicParamsExpanded.value).toBe(false);
  });

  it("uses the same capability controls for the settings and sidebar on a compatible Gemini model", async () => {
    const draft = form({
      temperature: 0.4,
      maxTokens: 8192,
      thinkingEnabled: true,
    });
    draft.modelId = "gemini-model";
    const settings = section(draft);
    const settingsEditor = settings.getComponent(ModelParametersEditor);
    expect(settingsEditor.props("providerType")).toBe("gemini");
    expect(settingsEditor.props("modelId")).toBe("gemini-model");
    const sidebar = mount(ModelParametersEditor, {
      props: {
        ...settingsEditor.props(),
        presentation: "sidebar",
        groups: undefined,
      },
      global: { stubs },
    });
    wrappers.push(sidebar);
    const controls = (wrapper: ReturnType<typeof mount>) =>
      wrapper
        .findAllComponents(ParameterItem)
        .map((item) => item.props("config").key);
    expect(controls(sidebar)).toEqual(controls(settings));
    expect(
      settings.find('[data-setting-id="parameters.safetySettings"]').exists()
    ).toBe(true);
  });
});
