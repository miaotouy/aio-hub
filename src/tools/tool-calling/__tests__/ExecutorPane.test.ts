// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus, { ElInputNumber } from "element-plus";
import { beforeEach, expect, it, vi } from "vitest";
const execution = vi.hoisted(() => ({
  execute: vi.fn(async (_request: any) => ({ success: true, data: [] })),
}));
vi.mock("@/services/executor", () => ({ execute: execution.execute }));
vi.mock("@/components/common/RichCodeEditor.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/LlmModelSelector.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
import ExecutorPane from "../components/ExecutorPane.vue";
const method = {
  name: "read_file",
  parameters: [
    { name: "path", type: "string", required: true, description: "File path" },
    { name: "startLine", type: "number", required: false },
    { name: "endLine", type: "number", required: false },
    { name: "maxResults", type: "number", required: false, defaultValue: 0 },
  ],
};
const group = { toolId: "file-operator", toolName: "Files", methods: [method] };
beforeEach(() => {
  localStorage.clear();
  execution.execute.mockClear();
});
it("submits omitted optional lines, explicit ranges, and cleared ranges while preserving explicit zero defaults", async () => {
  const wrapper = mount(ExecutorPane, {
    props: { groups: [group] },
    global: { plugins: [ElementPlus], stubs: { ExecutionResultCard: true } },
  });
  try {
    // This is the same public entry used when opening a discovered method in the sandbox.
    wrapper.vm.loadMethod(group, method);
    await flushPromises();
    await wrapper
      .get('input[placeholder="File path"]')
      .setValue("/tmp/example.txt");
    const run = async () => {
      await wrapper
        .findAll("button")
        .find((button) => button.text().includes("触发调用"))!
        .trigger("click");
      await flushPromises();
      return structuredClone(
        execution.execute.mock.calls.slice(-1)[0][0].params.requests[0].args
      );
    };
    expect(await run()).toEqual({ path: "/tmp/example.txt", maxResults: 0 });
    const numbers = wrapper.findAllComponents(ElInputNumber);
    await numbers[0].get("input").setValue("1");
    await numbers[0].get("input").trigger("change");
    await numbers[1].get("input").setValue("2");
    await numbers[1].get("input").trigger("change");
    expect(await run()).toEqual({
      path: "/tmp/example.txt",
      startLine: 1,
      endLine: 2,
      maxResults: 0,
    });
    for (const number of numbers.slice(0, 2)) {
      await number.get("input").setValue("");
      await number.get("input").trigger("change");
    }
    expect(await run()).toEqual({ path: "/tmp/example.txt", maxResults: 0 });
  } finally {
    wrapper.unmount();
  }
});
