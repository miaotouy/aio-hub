import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEditData, ChatAgent } from "../../../types/agent";

// 保护草稿隔离、保存/重开与切换对象的持久化契约；控件布局重构不影响断言。
const mocks = vi.hoisted(() => ({
  agents: new Map<string, ChatAgent>(),
  warning: vi.fn(),
}));
vi.mock("../../../stores/agentStore", () => ({
  useAgentStore: () => ({
    getAgentById: (id: string) => mocks.agents.get(id),
    loadAgentDetails: async (id: string) => mocks.agents.get(id),
  }),
}));
vi.mock("@/tools/llm-chat/composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: { value: { modelPreferences: { defaultModel: "" } } },
  }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ enabledProfiles: { value: [] } }),
}));
vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: "agent-a" } }),
}));
vi.mock("@/tools/agent-manager/utils/agentAssetUtils", () => ({
  resolveAgentAvatarPath: () => "",
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: mocks.warning },
}));
vi.mock("../../agent-editor/AgentEditor.vue", () => ({
  default: {
    name: "AgentEditor",
    props: ["modelValue"],
    template: `<div>
    <input data-field="name" v-model="modelValue.name" />
    <input data-field="temperature" type="number" v-model.number="modelValue.parameters.temperature" />
    <input data-field="summaryPrompt" v-if="modelValue.parameters.contextCompression" v-model="modelValue.parameters.contextCompression.summaryPrompt" />
    <input data-field="fold" type="checkbox" v-model="modelValue.defaultToolCallCollapsed" />
    <input data-field="visualGuideline" v-model="modelValue.visualGuideline" />
  </div>`,
  },
}));

const EditAgentDialog = (await import("../EditAgentDialog.vue")).default;
const MiniAgentList = (await import("../MiniAgentList.vue")).default;

function agent(id: string, temperature: number): ChatAgent {
  return {
    id,
    name: id,
    profileId: "profile",
    modelId: "model",
    createdAt: "2026-10-11",
    parameters: {
      temperature,
      maxTokens: 8192,
      enabledParameters: ["temperature", "maxTokens"],
      contextCompression: { enabled: false, summaryPrompt: "original" },
      contextPostProcessing: {
        rules: [{ type: "post:merge-system-to-head", enabled: true }],
      },
      custom: { enabled: true, params: { custom_field: { value: 7 } } },
    },
    defaultToolCallCollapsed: false,
    visualGuideline: "original guideline",
  };
}

function openDialog(props: Record<string, unknown> = {}) {
  return mount(EditAgentDialog, {
    props: {
      visible: true,
      mode: "edit",
      agent: mocks.agents.get("agent-a"),
      ...props,
    } as any,
    global: {
      stubs: {
        BaseDialog: {
          props: ["modelValue"],
          template: `<div v-if="modelValue"><slot /><slot name="footer" /></div>`,
        },
        MiniAgentList: {
          name: "MiniAgentList",
          emits: ["switch"],
          template: "<div />",
        },
        Avatar: true,
        "el-button": { template: "<button><slot /></button>" },
        "el-popover": {
          template: `<div><slot name="reference" /><slot /></div>`,
        },
      },
    },
  });
}

describe("agent configuration draft persistence", () => {
  beforeEach(() => {
    mocks.agents.clear();
    mocks.agents.set("agent-a", agent("agent-a", 0.4));
    mocks.agents.set("agent-b", agent("agent-b", 1.2));
    mocks.warning.mockClear();
  });

  it("discards an unsaved nested draft, then saves and reloads parameters and output options", async () => {
    const original = mocks.agents.get("agent-a")!;
    const wrapper = openDialog({
      onSave: (data: AgentEditData, options: { agentId: string }) =>
        mocks.agents.set(options.agentId, { ...original, ...data }),
    });
    await flushPromises();
    await wrapper.get("[data-field=temperature]").setValue("0.8");
    await wrapper.get("[data-field=summaryPrompt]").setValue("draft summary");
    expect(original.parameters?.temperature).toBe(0.4);
    expect(original.parameters?.contextCompression?.summaryPrompt).toBe(
      "original"
    );
    await wrapper.get("[data-testid=agent-editor-cancel]").trigger("click");
    expect(wrapper.emitted("save")).toBeUndefined();
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await flushPromises();
    expect(
      (wrapper.get("[data-field=temperature]").element as HTMLInputElement)
        .value
    ).toBe("0.4");
    await wrapper.get("[data-field=temperature]").setValue("0.9");
    await wrapper.get("[data-field=summaryPrompt]").setValue("saved summary");
    await wrapper.get("[data-field=fold]").setValue(true);
    await wrapper
      .get("[data-field=visualGuideline]")
      .setValue("saved guideline");
    await wrapper.get("[data-testid=agent-editor-save]").trigger("click");
    const saved = wrapper.emitted("save")![0][0] as AgentEditData;
    expect(saved.parameters).toMatchObject({
      temperature: 0.9,
      enabledParameters: ["temperature", "maxTokens"],
      contextCompression: { summaryPrompt: "saved summary" },
      contextPostProcessing: original.parameters!.contextPostProcessing,
      custom: original.parameters!.custom,
    });
    expect(saved.defaultToolCallCollapsed).toBe(true);
    expect(saved.visualGuideline).toBe("saved guideline");
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await flushPromises();
    expect(
      (wrapper.get("[data-field=temperature]").element as HTMLInputElement)
        .value
    ).toBe("0.9");
    expect(
      (wrapper.get("[data-field=fold]").element as HTMLInputElement).checked
    ).toBe(true);
    wrapper.unmount();
  });

  it("uses create initial data as an editable independent draft", async () => {
    const initialData = agent("template", 0.2);
    const wrapper = openDialog({ mode: "create", agent: null, initialData });
    await flushPromises();
    await wrapper.get("[data-field=temperature]").setValue("0.6");
    await wrapper.get("[data-testid=agent-editor-save]").trigger("click");
    const saved = wrapper.emitted("save")![0][0] as AgentEditData;
    expect(saved.parameters?.temperature).toBe(0.6);
    expect(initialData.parameters?.temperature).toBe(0.2);
    expect(saved.parameters?.custom).toEqual(initialData.parameters?.custom);
    wrapper.unmount();
  });

  it("silently saves to the previous agent before loading the next draft", async () => {
    const wrapper = openDialog();
    await flushPromises();
    await wrapper.get("[data-field=temperature]").setValue("0.7");
    wrapper
      .getComponent(MiniAgentList)
      .vm.$emit("switch", mocks.agents.get("agent-b"));
    await flushPromises();
    expect(wrapper.emitted("save")![0][1]).toMatchObject({
      agentId: "agent-a",
      silent: true,
    });
    expect(
      (wrapper.emitted("save")![0][0] as AgentEditData).parameters?.temperature
    ).toBe(0.7);
    expect(
      (wrapper.get("[data-field=temperature]").element as HTMLInputElement)
        .value
    ).toBe("1.2");
    await wrapper.get("[data-testid=agent-editor-save]").trigger("click");
    expect(wrapper.emitted("save")![1][1]).toMatchObject({
      agentId: "agent-b",
    });
    wrapper.unmount();
  });
});
