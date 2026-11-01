// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { defineComponent, h, nextTick, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionDetail } from "../../../../types";
import { useFlowTreeGraph } from "./useFlowTreeGraph";

const { palette } = vi.hoisted(() => ({
  palette: {
    user: { base: "#111", light: "#222", lighter: "#333" },
    assistant: { base: "#111", light: "#222", lighter: "#333" },
    system: { base: "#111", light: "#222", lighter: "#333" },
    tool: { base: "#111", light: "#222", lighter: "#333" },
    inactive: { base: "#111", light: "#222", lighter: "#333" },
    disabled: { base: "#111", light: "#222" },
    danger: { base: "#f00" },
    edge: { active: "#111", inactive: "#999" },
  },
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("@/composables/usePageActivity", () => ({
  usePageActivity: () => ({ value: true }),
}));
vi.mock("../../../../composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({ settings: { value: {} } }),
}));
vi.mock("../../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({ switchBranch: vi.fn() }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: () => null }),
}));
vi.mock("../../../../stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ getEffectiveProfile: () => null }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ getProfileById: () => null }),
}));
vi.mock("@/composables/useModelMetadata", () => ({
  useModelMetadata: () => ({
    getModelIcon: () => null,
    getDisplayIconPath: (path: string) => path,
  }),
}));
vi.mock("./useGraphThemePalette", () => ({
  useGraphThemePalette: () => ({
    palette,
    paletteVersion: { value: 0 },
  }),
}));
vi.mock("./useGraphShortcuts", () => ({
  useGraphShortcuts: vi.fn(),
}));
vi.mock("./useGraphSubtreeDrag", () => ({
  useGraphSubtreeDrag: () => ({
    handleNodeDragStart: vi.fn(),
    handleNodeDrag: vi.fn(),
    handleNodeDragStop: vi.fn(),
  }),
}));
vi.mock("./useGraphConnectionPreview", () => ({
  useGraphConnectionPreview: () => ({
    connectionPreviewState: { value: {} },
    handleConnectionStart: vi.fn(),
    handleConnectionEnd: vi.fn(),
    handleNodeMouseEnter: vi.fn(),
    handleNodeMouseLeave: vi.fn(),
    handleEdgeConnect: vi.fn(),
  }),
}));
vi.mock("./useGraphNodeActions", () => ({
  useGraphNodeActions: () => ({
    detailPopupState: { value: {} },
    handleNodeContextMenu: vi.fn(),
    handleNodeCopy: vi.fn(),
    handleNodeToggleEnabled: vi.fn(),
    handleNodeDelete: vi.fn(),
    handleNodeRegenerate: vi.fn(),
    handleNodeCreateBranch: vi.fn(),
    handleNodeViewDetail: vi.fn(),
    closeDetailPopup: vi.fn(),
  }),
}));
vi.mock("./useGraphD3Simulation", () => ({
  useGraphD3Simulation: () => ({
    simulation: ref(null),
    d3Nodes: ref([]),
    d3Links: ref([]),
    initD3Simulation: vi.fn(),
    updateNodeDimensions: vi.fn(),
    startWaitingForDimensions: vi.fn(),
  }),
}));

const wrappers: Array<{ unmount: () => void }> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

async function flushNodeUpdate() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function createSession(): ChatSessionDetail {
  return reactive({
    id: "session",
    updatedAt: "2026-11-01T00:00:00.000Z",
    rootNodeId: "root",
    activeLeafId: "reply",
    history: [],
    historyIndex: 0,
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["reply"],
        role: "user",
        status: "complete",
        content: "Question",
        timestamp: "2026-11-01T00:00:00.000Z",
        metadata: {},
      },
      reply: {
        id: "reply",
        parentId: "root",
        childrenIds: [],
        role: "assistant",
        status: "generating",
        content: "Initial answer",
        timestamp: "2026-11-01T00:00:01.000Z",
        metadata: {
          reasoningContent:
            "A reasoning preview longer than sixty characters remains stable while the stream continues.",
        },
      },
    },
  }) as unknown as ChatSessionDetail;
}

function mountGraph(session: ChatSessionDetail) {
  const updateNodeData = vi.fn(() => true);
  let graph!: ReturnType<typeof useFlowTreeGraph>;

  const wrapper = mount(
    defineComponent({
      setup() {
        graph = useFlowTreeGraph(
          () => session,
          ref({}),
          ref(null),
          updateNodeData
        );
        return () => h("div");
      },
    })
  );

  graph.updateChart();
  wrappers.push(wrapper);

  return { graph, updateNodeData };
}

// 防护单节点流式更新重新派生并替换整张图的节点、边和展示数据。
describe("incremental node display updates", () => {
  it("updates only the changed node and de-duplicates writes in one batch", async () => {
    const session = createSession();
    const { graph, updateNodeData } = mountGraph(session);
    const nodesBefore = graph.nodes.value;
    const edgesBefore = graph.edges.value;
    const rootDataBefore = graph.nodes.value.find(
      (node) => node.id === "root"
    )!.data;
    const replyDataBefore = graph.nodes.value.find(
      (node) => node.id === "reply"
    )!.data;

    session.nodes.reply.content = "First streamed answer";
    await flushNodeUpdate();

    expect(updateNodeData).toHaveBeenCalledTimes(1);
    expect(updateNodeData).toHaveBeenLastCalledWith(
      "reply",
      expect.objectContaining({ contentPreview: "First streamed answer" })
    );
    expect(graph.nodes.value).toBe(nodesBefore);
    expect(graph.edges.value).toBe(edgesBefore);
    expect(graph.nodes.value.find((node) => node.id === "root")!.data).toBe(
      rootDataBefore
    );
    expect(
      graph.nodes.value.find((node) => node.id === "reply")!.data
    ).not.toBe(replyDataBefore);

    session.nodes.reply.content = "A";
    session.nodes.reply.content = "B";
    await flushNodeUpdate();

    expect(updateNodeData).toHaveBeenCalledTimes(2);
    expect(updateNodeData).toHaveBeenLastCalledWith(
      "reply",
      expect.objectContaining({ contentPreview: "B" })
    );

    graph.updateChart();
    expect(graph.nodes.value.find((node) => node.id === "root")!.data).toBe(
      rootDataBefore
    );
  });

  it("skips display commits while the reasoning tail keeps the same preview", async () => {
    const session = createSession();
    const { updateNodeData } = mountGraph(session);

    session.nodes.reply.metadata!.reasoningContent += " More reasoning.";
    await flushNodeUpdate();

    expect(updateNodeData).not.toHaveBeenCalled();
  });
});
