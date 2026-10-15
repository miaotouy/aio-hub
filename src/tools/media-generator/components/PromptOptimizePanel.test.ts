// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ElementPlus from "element-plus";
import PromptOptimizePanel from "./PromptOptimizePanel.vue";

const mocks = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest: mocks.sendRequest }),
}));
vi.mock("../stores/mediaGenStore", () => ({
  useMediaGenStore: () => ({
    currentConfig: { activeType: "image" },
    attachments: [],
    settings: {
      promptOptimization: {
        modelCombo: "profile:model",
        prompt: "优化：{text}",
        targetLangList: ["English"],
      },
    },
  }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    enabledProfiles: { value: [{ id: "profile", models: [{ id: "model" }] }] },
    getProfileById: () => ({ models: [{ id: "model", capabilities: {} }] }),
  }),
}));
vi.mock("@/composables/useAssetManager", () => ({ assetManagerEngine: {} }));
vi.mock("../config", () => ({
  MEDIA_GENERATOR_TARGET_LANG_OPTIONS: [{ label: "英语", value: "English" }],
}));
vi.mock("@/components/common/LlmModelSelector.vue", () => ({
  default: { template: '<input aria-label="优化模型" />' },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { error: mocks.error, warning: vi.fn() },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

let wrapper: VueWrapper | undefined;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
function openPanel() {
  wrapper = mount(PromptOptimizePanel, {
    props: { promptText: "初始草稿" },
    global: { plugins: [ElementPlus] },
  });
  return wrapper;
}
function button(label: string) {
  return wrapper!.findAll("button").find((item) => item.text() === label)!;
}

// Public request lifecycle: releasing a panel cancels work; editing the draft
// while it is open changes the next request, and application stays explicit.
describe("prompt optimization panel lifecycle", () => {
  it("aborts an in-flight request when the panel is released and keeps cancellation quiet", async () => {
    let signal: AbortSignal | undefined;
    mocks.sendRequest.mockImplementation((options) => {
      signal = options.signal;
      return new Promise((_, reject) => {
        signal!.addEventListener(
          "abort",
          () => reject(new Error("cancelled")),
          { once: true }
        );
      });
    });
    const panel = openPanel();
    await button("开始优化").trigger("click");
    expect(mocks.sendRequest).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    panel.unmount();
    wrapper = undefined;
    await flushPromises();
    expect(signal?.aborted).toBe(true);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("uses the current draft and applies a completed result only on confirmation", async () => {
    mocks.sendRequest.mockResolvedValue({ content: "优化后的画面" });
    const panel = openPanel();
    await panel.setProps({ promptText: "继续编辑的草稿" });
    await button("开始优化").trigger("click");
    await flushPromises();
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "优化：继续编辑的草稿" }],
      })
    );
    expect(panel.emitted("apply")).toBeUndefined();
    await button("确认并应用").trigger("click");
    expect(panel.emitted("apply")).toEqual([["优化后的画面"]]);
  });
});
