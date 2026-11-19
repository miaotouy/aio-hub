// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import ElementPlus, { ElInputNumber } from "element-plus";
import { expect, it, vi } from "vitest";
import { DEFAULT_TOOL_CALL_CONFIG } from "@/tools/agent-manager/types/agent";
vi.mock("@/tools/tool-calling/composables/useToolCalling", () => ({
  useToolCalling: () => ({ getDiscoveredMethods: () => [] }),
}));
vi.mock("@/services/decision-arbiter/channelConfig", () => ({
  getDecisionChannelSettings: () => ({ engine: "jev" }),
}));
vi.mock("@/tools/llm-chat/components/common/ToolCallingHelpDialog.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/tools/tool-calling/components/ApprovalModelSettings.vue", () => ({
  default: { template: "<div />" },
}));
import ToolCallingSection from "./ToolCallingSection.vue";

it.each([DEFAULT_TOOL_CALL_CONFIG.maxIterations, 50])(
  "preserves %i iterations when opening the real numeric control and serializing the draft",
  async (maxIterations) => {
    const form = reactive({
      toolCallConfig: {
        ...structuredClone(DEFAULT_TOOL_CALL_CONFIG),
        enabled: true,
        maxIterations,
      },
      presetMessages: [],
    });
    const wrapper = mount(ToolCallingSection, {
      global: {
        plugins: [ElementPlus],
        provide: { "agent-edit-form": form, "active-tab": ref("tools") },
        stubs: { ToolCallingItem: true },
      },
    });
    try {
      await flushPromises();
      const field = wrapper
        .findAllComponents(ElInputNumber)
        .find((component) => component.props("modelValue") === maxIterations);
      expect(field?.find("input").element.value).toBe(String(maxIterations));
      expect(
        JSON.parse(JSON.stringify(form)).toolCallConfig.maxIterations
      ).toBe(maxIterations);
    } finally {
      wrapper.unmount();
    }
  }
);
