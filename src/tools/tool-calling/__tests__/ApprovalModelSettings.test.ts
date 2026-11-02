import { flushPromises, mount } from "@vue/test-utils";
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElRadioButton,
  ElRadioGroup,
} from "element-plus";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DECISION_CHANNEL_SETTINGS,
  type DecisionChannelSettings,
} from "@/services/decision-arbiter/types";
import { LLM_APPROVAL_MODEL_CAPABILITIES } from "@/services/decision-arbiter/llmApproval";
import ApprovalModelSettings from "../components/ApprovalModelSettings.vue";

const config = vi.hoisted(() => ({
  get: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/services/decision-arbiter/channelConfig", () => ({
  getDecisionChannelSettings: config.get,
  loadDecisionChannelSettings: config.load,
  saveDecisionChannelSettings: config.save,
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn() },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

const modelSelector = {
  name: "LlmModelSelector",
  props: ["modelValue", "capabilities", "disabled"],
  emits: ["update:modelValue"],
  template: "<div />",
};

function mountSettings() {
  return mount(ApprovalModelSettings, {
    global: {
      components: {
        ElButton,
        ElForm,
        ElFormItem,
        ElInput,
        ElInputNumber,
        ElRadioButton,
        ElRadioGroup,
      },
      stubs: { LlmModelSelector: modelSelector },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  config.get.mockReturnValue({ ...DEFAULT_DECISION_CHANNEL_SETTINGS });
  config.load.mockResolvedValue({ ...DEFAULT_DECISION_CHANNEL_SETTINGS });
  config.save.mockResolvedValue(undefined);
});

describe("ApprovalModelSettings", () => {
  it("loads the shared model settings and preserves every field when saving", async () => {
    const saved: DecisionChannelSettings = {
      engine: "llm",
      profileId: "review-channel",
      model: "review-model",
      timeoutMs: 45_000,
      maxRetries: 2,
      llmInstructions: "Ask before overwriting files.",
    };
    config.load.mockResolvedValue(saved);
    const wrapper = mountSettings();
    await flushPromises();

    expect(wrapper.findComponent(modelSelector).props("modelValue")).toBe(
      "review-channel:review-model"
    );
    expect(wrapper.findComponent(ElInputNumber).props("modelValue")).toBe(45);
    expect(wrapper.find("textarea").element.value).toBe(saved.llmInstructions);
    await wrapper.get('[data-testid="decision-channel-save"]').trigger("click");
    await flushPromises();
    expect(config.save).toHaveBeenCalledExactlyOnceWith(saved);
    wrapper.unmount();
  });

  it("switches model capabilities and saves the selected model, timeout and review rules", async () => {
    config.load.mockResolvedValue({
      ...DEFAULT_DECISION_CHANNEL_SETTINGS,
      profileId: "jev-channel",
      model: "jev-model",
    });
    const wrapper = mountSettings();
    await flushPromises();
    const selector = wrapper.findComponent(modelSelector);
    expect(selector.props("capabilities")).toEqual({ decision: true });

    await wrapper
      .get('[data-testid="approval-engine-llm"] input[type="radio"]')
      .setValue(true);
    expect(selector.props("capabilities")).toEqual(
      LLM_APPROVAL_MODEL_CAPABILITIES
    );
    expect(selector.props("modelValue")).toBe("");
    expect(wrapper.findComponent(ElInputNumber).props("modelValue")).toBe(30);
    const engineChanges = wrapper.emitted("engine-change") ?? [];
    expect(engineChanges[engineChanges.length - 1]).toEqual(["llm"]);

    selector.vm.$emit("update:modelValue", "text-channel:review-model:latest");
    wrapper.findComponent(ElInputNumber).vm.$emit("update:modelValue", 47);
    await wrapper
      .get("textarea")
      .setValue("Only read files inside the workspace.");
    await wrapper.get('[data-testid="decision-channel-save"]').trigger("click");
    await flushPromises();
    expect(config.save).toHaveBeenCalledExactlyOnceWith({
      ...DEFAULT_DECISION_CHANNEL_SETTINGS,
      engine: "llm",
      profileId: "text-channel",
      model: "review-model:latest",
      timeoutMs: 47_000,
      llmInstructions: "Only read files inside the workspace.",
    });
    wrapper.unmount();
  });
});
