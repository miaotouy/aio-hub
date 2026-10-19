// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generatingNodeIds: new Set<string>(),
  abortNodeGeneration: vi.fn(),
}));
vi.mock("../../../../stores/llmChatStore", async () => {
  const { reactive } = await import("vue");
  mocks.generatingNodeIds = reactive(new Set<string>());
  return {
    useLlmChatStore: () => ({
      isNodeGenerating: (id: string) => mocks.generatingNodeIds.has(id),
      abortNodeGeneration: mocks.abortNodeGeneration,
    }),
  };
});
vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: null } }),
}));
vi.mock("@/tools/llm-chat/composables/ui/useModelReselection", () => ({
  useModelReselection: () => ({
    getTemporaryModelPayload: () => undefined,
    openModelReselectDialog: vi.fn(),
  }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: vi.fn() }),
}));
vi.mock("../../../export/ExportBranchDialog.vue", () => ({ default: {} }));
vi.mock("../../../message/MessageDataEditor.vue", () => ({ default: {} }));

const GraphNodeMenubar = (await import("./GraphNodeMenubar.vue")).default;
let wrapper: VueWrapper;
function mountMenubar(messageId = "node-a") {
  wrapper = mount(GraphNodeMenubar, {
    props: {
      messageId,
      role: "assistant",
      isEnabled: true,
      isActiveLeaf: true,
    },
    global: {
      stubs: {
        ElTooltip: { template: "<div><slot /></div>" },
        ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
        ElDropdownMenu: { template: "<div><slot /></div>" },
        ElDropdownItem: { template: "<div><slot /></div>" },
        ElPopconfirm: { template: '<div><slot name="reference" /></div>' },
      },
    },
  });
  return wrapper;
}

// 保护节点运行状态与可执行操作的一致性，以及停止操作的节点作用域。
describe("Graph node generation actions", () => {
  beforeEach(() => {
    mocks.generatingNodeIds.clear();
    mocks.abortNodeGeneration.mockReset();
  });
  afterEach(() => wrapper?.unmount());

  it("replaces generation actions with stop and restores actions when the task ends", async () => {
    mocks.generatingNodeIds.add("node-a");
    mountMenubar();
    expect(wrapper.find('[aria-label="创建分支"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="重新生成"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="指定模型重新生成"]').exists()).toBe(
      false
    );
    await wrapper.get('[aria-label="停止生成"]').trigger("click");
    expect(mocks.abortNodeGeneration).toHaveBeenCalledExactlyOnceWith("node-a");

    mocks.generatingNodeIds.delete("node-a");
    await nextTick();
    expect(wrapper.find('[aria-label="停止生成"]').exists()).toBe(false);
    await wrapper.get('[aria-label="创建分支"]').trigger("click");
    await wrapper.get('[aria-label="重新生成"]').trigger("click");
    expect(wrapper.emitted("create-branch")).toHaveLength(1);
    expect(wrapper.emitted("regenerate")).toEqual([[]]);
  });

  it("tracks the selected node independently of other running nodes", async () => {
    mocks.generatingNodeIds.add("node-a");
    mountMenubar("node-b");
    expect(wrapper.find('[aria-label="停止生成"]').exists()).toBe(false);
    await wrapper.get('[aria-label="重新生成"]').trigger("click");
    expect(wrapper.emitted("regenerate")).toEqual([[]]);

    mocks.generatingNodeIds.add("node-b");
    await nextTick();
    await wrapper.get('[aria-label="停止生成"]').trigger("click");
    expect(mocks.abortNodeGeneration).toHaveBeenCalledExactlyOnceWith("node-b");
    await wrapper.setProps({ messageId: "node-a" });
    await wrapper.get('[aria-label="停止生成"]').trigger("click");
    expect(mocks.abortNodeGeneration).toHaveBeenLastCalledWith("node-a");
  });
});
