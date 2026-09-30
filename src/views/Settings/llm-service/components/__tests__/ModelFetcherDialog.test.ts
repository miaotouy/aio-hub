import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { LlmModelInfo } from "@/types/llm-profiles";

vi.mock("@/composables/useModelMetadata", () => ({
  useModelMetadata: () => ({
    getDisplayIconPath: (path: string) => path,
    getIconPath: () => undefined,
    materializeModel: (model: LlmModelInfo) => ({ model }),
  }),
}));

import ModelFetcherDialog from "../ModelFetcherDialog.vue";

const commonStubs = {
  BaseDialog: {
    template: '<div><slot name="content" /><slot name="footer" /></div>',
  },
  DynamicIcon: { template: "<img />" },
  ElInput: { template: "<input />" },
  ElSelect: { template: "<div><slot /></div>" },
  ElOption: { template: "<div><slot /></div>" },
  ElButton: { template: "<button><slot /></button>" },
  ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
  ElDropdownMenu: { template: "<div><slot /></div>" },
  ElDropdownItem: { template: "<button><slot /></button>" },
  ElTooltip: { template: "<div><slot /></div>" },
  ElIcon: { template: "<i><slot /></i>" },
  ElTag: { template: "<span><slot /></span>" },
};

function suggestion(canonicalId: string) {
  return {
    identity: { canonicalId, source: "provider" as const },
    confidence: "suggested" as const,
    evidence: "Provider model catalog declared owner: custom",
  };
}

describe("ModelFetcherDialog", () => {
  it("shows model identity suggestions only for embedding-capable models", () => {
    const wrapper = mount(ModelFetcherDialog, {
      props: {
        visible: true,
        existingModels: [],
        models: [
          {
            id: "chat-model",
            name: "Chat model",
            capabilities: { thinking: true },
            modelIdentitySuggestion: suggestion("custom/chat-model"),
          },
          {
            id: "embedding-model",
            name: "Embedding model",
            capabilities: { embedding: true },
            modelIdentitySuggestion: suggestion("custom/embedding-model"),
          },
        ],
      },
      global: { stubs: commonStubs },
    });

    expect(wrapper.text()).toContain("custom/embedding-model");
    expect(wrapper.text()).not.toContain("custom/chat-model");
  });

  it("lets existing models be marked for removal and emits remove-models", async () => {
    const wrapper = mount(ModelFetcherDialog, {
      props: {
        visible: true,
        existingModels: [{ id: "existing-a", name: "Existing A" }],
        models: [
          { id: "existing-a", name: "Existing A" },
          { id: "fresh-b", name: "Fresh B" },
        ],
      },
      global: { stubs: commonStubs },
    });

    const items = wrapper.findAll(".model-item");
    const existingItem = items.find((item) =>
      item.text().includes("existing-a")
    );
    const freshItem = items.find((item) => item.text().includes("fresh-b"));
    expect(existingItem).toBeDefined();
    expect(freshItem).toBeDefined();

    await existingItem!.trigger("click");
    expect(existingItem!.classes()).toContain("markedRemove");
    expect(wrapper.text()).toContain("移除 1 个");

    await freshItem!.trigger("click");
    expect(freshItem!.classes()).toContain("selected");

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("确定"));
    await confirmButton!.trigger("click");

    expect(wrapper.emitted("remove-models")?.[0]).toEqual([["existing-a"]]);
    expect(
      (wrapper.emitted("add-models")?.[0]?.[0] as LlmModelInfo[]).map(
        (m) => m.id
      )
    ).toEqual(["fresh-b"]);
  });

  it("clears the removal mark when an existing model is clicked again", async () => {
    const wrapper = mount(ModelFetcherDialog, {
      props: {
        visible: true,
        existingModels: [{ id: "existing-a", name: "Existing A" }],
        models: [{ id: "existing-a", name: "Existing A" }],
      },
      global: { stubs: commonStubs },
    });

    const item = wrapper.findAll(".model-item")[0];
    await item.trigger("click");
    expect(item.classes()).toContain("markedRemove");
    await item.trigger("click");
    expect(item.classes()).not.toContain("markedRemove");
    expect(wrapper.text()).not.toContain("移除");
  });
});
