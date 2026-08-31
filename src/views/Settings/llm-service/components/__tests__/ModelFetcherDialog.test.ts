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
  ElDropdown: { template: "<div><slot /><slot name=\"dropdown\" /></div>" },
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
});