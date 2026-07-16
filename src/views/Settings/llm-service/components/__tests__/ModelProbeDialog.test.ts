import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import type { LlmProfile } from "@/types/llm-profiles";
import ModelProbeDialog from "../ModelProbeDialog.vue";

const TableStub = defineComponent({
  name: "ElTable",
  props: ["data"],
  setup(_, { expose }) {
    expose({ setScrollTop: vi.fn() });
    return {};
  },
  template: '<div class="table-stub"><slot /><slot name="empty" /></div>',
});

const commonStubs = {
  BaseDialog: {
    props: ["modelValue"],
    template:
      '<div class="dialog-stub"><slot name="content" /><slot name="footer" /></div>',
  },
  ElTable: TableStub,
  ElTableColumn: { template: "<div />" },
  ElSelect: { template: "<div><slot /></div>" },
  ElOption: { template: "<div><slot /></div>" },
  ElInput: { template: "<input />" },
  ElInputNumber: { template: "<input />" },
  ElSwitch: { template: '<input type="checkbox" />' },
  ElCheckbox: { template: '<input type="checkbox" />' },
  ElButton: { template: "<button><slot /></button>" },
  ElTag: { template: "<span><slot /></span>" },
  ElTooltip: { template: "<div><slot /></div>" },
  ElProgress: { template: "<div />" },
};

function profile(): LlmProfile {
  return {
    id: "profile-1",
    name: "Test",
    type: "openai",
    baseUrl: "https://example.com",
    apiKeys: ["secret"],
    enabled: true,
    models: [
      { id: "chat-model", name: "Chat Model" },
      {
        id: "embedding-model",
        name: "Vector Model",
        capabilities: { embedding: true },
      },
      {
        id: "image-model",
        name: "Image Model",
        capabilities: { imageGeneration: true },
      },
    ],
  };
}

function mountDialog(initialModelId?: string) {
  return mount(ModelProbeDialog, {
    props: {
      modelValue: true,
      profile: profile(),
      initialModelId,
      results: {},
      loading: {},
      batchRunning: false,
      batchProgress: {
        completed: 0,
        total: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
      },
    },
    global: { stubs: commonStubs },
  });
}

function stateOf(wrapper: ReturnType<typeof mountDialog>) {
  return (wrapper.vm.$ as any).setupState;
}

describe("ModelProbeDialog", () => {
  it("selects only the row-entry model and leaves the batch entry empty", async () => {
    const rowEntry = mountDialog("embedding-model");
    await nextTick();
    expect(stateOf(rowEntry).selectedIds).toEqual(["embedding-model"]);

    const batchEntry = mountDialog();
    await nextTick();
    expect(stateOf(batchEntry).selectedIds).toEqual([]);
  });

  it("keeps row selection independent and checks only filtered models", async () => {
    const wrapper = mountDialog();
    const state = stateOf(wrapper);

    state.toggleModel("chat-model");
    expect(state.selectedIds).toEqual(["chat-model"]);
    expect(state.rowClassName({ row: profile().models[0] })).toBe(
      "probe-row-selected"
    );

    state.searchQuery = "vector";
    await nextTick();
    expect(
      state.filteredModels.map((model: { id: string }) => model.id)
    ).toEqual(["embedding-model"]);
    state.testBatch(
      state.filteredModels.map((model: { id: string }) => model.id)
    );

    expect(wrapper.emitted("batch")?.[0]).toEqual([
      ["embedding-model"],
      {
        endpointType: "auto",
        stream: false,
        allowCostlyMedia: false,
        concurrency: 3,
      },
    ]);
    expect(state.selectedIds).toEqual(["chat-model"]);
  });

  it("forces non-streaming endpoint events and toggles inline details", async () => {
    const wrapper = mountDialog();
    const state = stateOf(wrapper);
    state.stream = true;
    state.endpointType = "embeddings";
    await nextTick();

    state.testSingle(profile().models[1]);
    expect(wrapper.emitted("test")?.[0]?.[1]).toEqual({
      endpointType: "embeddings",
      stream: false,
      allowCostlyMedia: false,
    });

    state.toggleDetails("embedding-model");
    expect(state.expandedIds).toEqual(["embedding-model"]);
    state.toggleDetails("embedding-model");
    expect(state.expandedIds).toEqual([]);
  });

  it("blocks closing while a single probe is running and emits cancellation", async () => {
    const wrapper = mountDialog();
    const state = stateOf(wrapper);
    await wrapper.setProps({ loading: { "chat-model": true } });

    state.closeDialog();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    await wrapper.setProps({ batchRunning: true, loading: {} });
    const stopButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("停止检查"));
    expect(stopButton).toBeDefined();
    await stopButton!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
