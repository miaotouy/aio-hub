// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ElementPlus from "element-plus";
import PromptOptimizePanel from "./PromptOptimizePanel.vue";

const mocks = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  error: vi.fn(),
  getAssetBase64: vi.fn(),
  supportsVision: false,
  store: {
    currentConfig: { activeType: "image" },
    attachments: [] as { id: string; type: string; path: string }[],
    settings: {
      promptOptimization: {
        includeReferenceImages: true,
        modelCombo: "profile:model",
        prompt: "优化：{text}",
        translationPrompt: "翻译：{text}",
        targetLangList: ["English"],
      },
    },
  },
}));
vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest: mocks.sendRequest }),
}));
vi.mock("../stores/mediaGenStore", async () => {
  const { reactive } = await import("vue");
  return { useMediaGenStore: () => reactive(mocks.store) };
});
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    enabledProfiles: { value: [{ id: "profile", models: [{ id: "model" }] }] },
    getProfileById: () => ({
      models: [{ id: "model", capabilities: { vision: mocks.supportsVision } }],
    }),
  }),
}));
vi.mock("@/composables/useAssetManager", () => ({
  assetManagerEngine: { getAssetBase64: mocks.getAssetBase64 },
}));
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.supportsVision = false;
  mocks.store.attachments = [];
  mocks.store.settings.promptOptimization.includeReferenceImages = true;
});
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

// Protect the public request contract: the opt-in and mode/capability limits
// control both asset reads and outgoing image content, regardless of internals.
describe("prompt optimization reference images", () => {
  it.each([
    { enabled: true, vision: true, translate: false, sendsImages: true },
    { enabled: false, vision: true, translate: false, sendsImages: false },
    { enabled: true, vision: false, translate: false, sendsImages: false },
    { enabled: true, vision: true, translate: true, sendsImages: false },
  ])(
    "enabled=$enabled vision=$vision translate=$translate sendsImages=$sendsImages",
    async ({ enabled, vision, translate, sendsImages }) => {
      mocks.supportsVision = vision;
      mocks.store.attachments = [
        { id: "reference", type: "image", path: "reference.png" },
      ];
      mocks.getAssetBase64.mockResolvedValue("data:image/png;base64,reference");
      mocks.sendRequest.mockResolvedValue({ content: "完成" });
      const panel = openPanel();
      if (!enabled) {
        await panel.get('input[aria-label="参考附件图片"]').setValue(false);
      }
      if (translate) {
        await panel
          .findComponent({ name: "ElSelect" })
          .vm.$emit("update:modelValue", "translate");
      }
      const referenceSwitch = panel.get('input[aria-label="参考附件图片"]')
        .element as HTMLInputElement;
      expect(referenceSwitch.disabled).toBe(!vision || translate);
      expect(referenceSwitch.checked).toBe(enabled && vision && !translate);
      expect(
        mocks.store.settings.promptOptimization.includeReferenceImages
      ).toBe(enabled);
      await button("开始优化").trigger("click");
      await flushPromises();
      expect(mocks.getAssetBase64).toHaveBeenCalledTimes(sendsImages ? 1 : 0);
      const content = mocks.sendRequest.mock.calls[0][0].messages[0].content;
      if (sendsImages) {
        expect(content).toEqual(
          expect.arrayContaining([
            { type: "image", imageBase64: "data:image/png;base64,reference" },
          ])
        );
      } else {
        expect(content).toBe(translate ? "翻译：初始草稿" : "优化：初始草稿");
      }
    }
  );

  it("retains the reference-image preference when reopening the panel", async () => {
    mocks.supportsVision = true;
    const panel = openPanel();
    await panel.get('input[aria-label="参考附件图片"]').setValue(false);
    expect(mocks.store.settings.promptOptimization.includeReferenceImages).toBe(
      false
    );
    panel.unmount();
    const reopened = openPanel();
    expect(
      (
        reopened.get('input[aria-label="参考附件图片"]')
          .element as HTMLInputElement
      ).checked
    ).toBe(false);
  });
});
