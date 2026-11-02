// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { defineComponent, h, nextTick, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useVueFlow, VueFlow } from "@vue-flow/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionDetail } from "../../../../types";
import { useFlowTreeGraph } from "./useFlowTreeGraph";

const { palette, layoutFixture } = vi.hoisted(() => ({
  layoutFixture: { real: false },
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
  usePageActivity: () => ref(true),
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
    paletteVersion: ref(0),
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
vi.mock("./useGraphD3Simulation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./useGraphD3Simulation")>();
  return {
    useGraphD3Simulation: (
      ...args: Parameters<typeof actual.useGraphD3Simulation>
    ) =>
      layoutFixture.real
        ? actual.useGraphD3Simulation(...args)
        : {
            simulation: ref(null),
            d3Nodes: ref([]),
            d3Links: ref([]),
            initD3Simulation: vi.fn(),
            updateNodeDimensions: vi.fn(),
            startWaitingForDimensions: vi.fn(),
          },
  };
});

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
        childrenIds: ["reply", "branch"],
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
      branch: {
        id: "branch",
        parentId: "root",
        childrenIds: [],
        role: "assistant",
        status: "complete",
        content: "Alternative answer",
        timestamp: "2026-11-01T00:00:02.000Z",
        metadata: {},
      },
    },
  }) as unknown as ChatSessionDetail;
}

function createCompressionSession(): ChatSessionDetail {
  return reactive({
    id: "compression-session",
    updatedAt: "2026-11-01T00:00:00.000Z",
    rootNodeId: "root",
    activeLeafId: "tail",
    history: [],
    historyIndex: 0,
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["compressed-1"],
        role: "user",
        status: "complete",
        content: "Question",
        timestamp: "2026-11-01T00:00:00.000Z",
        metadata: {},
      },
      "compressed-1": {
        id: "compressed-1",
        parentId: "root",
        childrenIds: ["compressed-2"],
        role: "assistant",
        status: "complete",
        content: "First answer",
        timestamp: "2026-11-01T00:00:01.000Z",
        metadata: {},
      },
      "compressed-2": {
        id: "compressed-2",
        parentId: "compressed-1",
        childrenIds: ["summary"],
        role: "user",
        status: "complete",
        content: "Follow-up",
        timestamp: "2026-11-01T00:00:02.000Z",
        metadata: {},
      },
      summary: {
        id: "summary",
        parentId: "compressed-2",
        childrenIds: ["tail"],
        role: "system",
        status: "complete",
        content: "Compressed summary",
        timestamp: "2026-11-01T00:00:03.000Z",
        metadata: {
          isCompressionNode: true,
          compressedNodeIds: ["compressed-1", "compressed-2"],
          originalMessageCount: 2,
        },
      },
      tail: {
        id: "tail",
        parentId: "summary",
        childrenIds: [],
        role: "assistant",
        status: "complete",
        content: "Latest answer",
        timestamp: "2026-11-01T00:00:04.000Z",
        metadata: {},
      },
    },
  }) as unknown as ChatSessionDetail;
}

let graphInstanceId = 0;

function mountGraph(
  session: ChatSessionDetail,
  withVueFlow = false,
  withLayout = false
) {
  layoutFixture.real = withLayout;
  const id = `incremental-graph-${++graphInstanceId}`;
  let flow: ReturnType<typeof useVueFlow> | undefined;
  const updateNodeData = vi.fn((id: string, data: any) => {
    flow?.updateNodeData(id, data, { replace: true });
    return true;
  });
  const updateEdge = vi.fn((id: string, update: any) => {
    const edge = flow?.findEdge(id);
    if (edge) Object.assign(edge, update);
    return true;
  });
  const addNodes = vi.fn((nodes: any[]) => flow?.addNodes(nodes));
  const addEdges = vi.fn((edges: any[]) => flow?.addEdges(edges));
  let graph!: ReturnType<typeof useFlowTreeGraph>;

  const wrapper = mount(
    defineComponent({
      setup() {
        if (withVueFlow) flow = useVueFlow(id);
        graph = useFlowTreeGraph(
          () => session,
          ref({}),
          ref(null),
          updateNodeData,
          updateEdge,
          addNodes,
          addEdges
        );
        return () =>
          withVueFlow
            ? h(
                VueFlow,
                {
                  id,
                  nodes: graph.nodes.value,
                  edges: graph.edges.value,
                  "onUpdate:nodes": (nodes) => {
                    graph.nodes.value = nodes;
                  },
                  "onUpdate:edges": (edges) => {
                    graph.edges.value = edges;
                  },
                },
                { "node-custom": () => h("div") }
              )
            : h("div");
      },
    })
  );

  layoutFixture.real = false;
  graph.updateChart();
  wrappers.push(wrapper);

  return { graph, updateNodeData, updateEdge, addNodes, addEdges, flow };
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

  it("appends a message pair without replacing existing graph arrays", async () => {
    const session = createSession();
    const { graph, updateNodeData, addNodes, addEdges } = mountGraph(session);
    const nodesBefore = graph.nodes.value;
    const edgesBefore = graph.edges.value;
    const replyDataBefore = graph.nodes.value.find(
      (node) => node.id === "reply"
    )!.data;

    session.nodes.reply.childrenIds = ["continued-user"];
    session.nodes["continued-user"] = {
      id: "continued-user",
      parentId: "reply",
      childrenIds: ["continued-assistant"],
      role: "user",
      status: "complete",
      content: "Continue",
      timestamp: "2026-11-01T00:00:03.000Z",
      metadata: {},
    };
    session.nodes["continued-assistant"] = {
      id: "continued-assistant",
      parentId: "continued-user",
      childrenIds: [],
      role: "assistant",
      status: "waiting",
      content: "",
      timestamp: "2026-11-01T00:00:04.000Z",
      metadata: {},
    };
    session.activeLeafId = "continued-assistant";
    await flushNodeUpdate();

    expect(addNodes).toHaveBeenCalledTimes(1);
    expect(addNodes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "continued-user",
        data: expect.objectContaining({
          contentPreview: "Continue",
          isActiveLeaf: false,
        }),
      }),
      expect.objectContaining({
        id: "continued-assistant",
        data: expect.objectContaining({ isActiveLeaf: true }),
      }),
    ]);
    expect(addEdges).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "reply-continued-user",
        source: "reply",
        target: "continued-user",
      }),
      expect.objectContaining({
        id: "continued-user-continued-assistant",
        source: "continued-user",
        target: "continued-assistant",
      }),
    ]);
    expect(updateNodeData).toHaveBeenCalledWith(
      "reply",
      expect.objectContaining({ isActiveLeaf: false })
    );
    expect(graph.nodes.value).toBe(nodesBefore);
    expect(graph.edges.value).toBe(edgesBefore);
    expect(
      graph.nodes.value.find((node) => node.id === "reply")!.data
    ).not.toBe(replyDataBefore);
  });

  // 保护真实 Vue Flow 的双向同步：连续追加后仍能定点刷新，后续对账保留最新内容和位置。
  it("keeps appended store nodes synchronized across streaming and reconciliation", async () => {
    const session = createSession();
    const { graph, flow } = mountGraph(session, true);
    await flushNodeUpdate();
    const rootBefore = flow!.findNode("root")!;
    const rootDataBefore = rootBefore.data;
    const setNodes = vi.spyOn(flow!, "setNodes");
    const setEdges = vi.spyOn(flow!, "setEdges");

    for (const [id, parentId] of [
      ["next-user", "reply"],
      ["next-reply", "next-user"],
    ]) {
      session.nodes[parentId].childrenIds.push(id);
      session.nodes[id] = {
        ...session.nodes.reply,
        id,
        parentId,
        childrenIds: [],
        content: id,
        metadata: {},
      };
      session.activeLeafId = id;
      await flushNodeUpdate();
      expect(flow!.findNode(id)?.data.isActiveLeaf).toBe(true);
      expect(graph.nodes.value.find((node) => node.id === id)).toBe(
        flow!.findNode(id)
      );
      expect(flow!.findEdge(`${parentId}-${id}`)).toBeDefined();
    }

    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(flow!.findNode("root")).toBe(rootBefore);
    expect(flow!.findNode("root")!.data).toBe(rootDataBefore);
    expect(flow!.findNode("reply")!.data.isActiveLeaf).toBe(false);

    session.nodes["next-reply"].content = "Streamed continuation";
    await flushNodeUpdate();
    expect(flow!.findNode("next-reply")!.data.contentPreview).toBe(
      "Streamed continuation"
    );
    flow!.findNode("next-reply")!.position = { x: 420, y: 840 };
    session.nodes.branch.parentId = "reply";
    await flushNodeUpdate();
    expect(flow!.findNode("next-reply")!.data.contentPreview).toBe(
      "Streamed continuation"
    );
    expect(flow!.findNode("next-reply")!.position).toEqual({ x: 420, y: 840 });
    expect(flow!.findEdge("reply-branch")).toBeDefined();
  });

  // 保护撤销后重做的物理布局：尺寸缓存命中时也要等新节点同步完成，再重建模拟。
  it("includes restored nodes in physics layout when their dimensions are cached", async () => {
    const session = createSession();
    const { graph } = mountGraph(session, true, true);
    await flushNodeUpdate();
    graph.switchLayoutMode("physics");
    graph.updateNodeDimensions(
      new Map(
        ["root", "reply", "branch", "restored"].map((id) => [
          id,
          { width: 220, height: 140 },
        ])
      )
    );
    session.nodes["restored"] = {
      ...session.nodes.reply,
      id: "restored",
      parentId: "reply",
      childrenIds: [],
      metadata: {},
    };
    session.activeLeafId = "restored";
    await flushNodeUpdate();

    expect(graph.d3Nodes.value.map((node) => node.id)).toContain("restored");
    expect(graph.d3Links.value).toHaveLength(3);
  });

  it("falls back to full reconciliation when an existing node changes parent", async () => {
    const session = createSession();
    const { graph, addNodes } = mountGraph(session);
    const nodesBefore = graph.nodes.value;

    session.nodes.branch.parentId = "reply";
    session.nodes["restored"] = {
      ...session.nodes.reply,
      id: "restored",
      parentId: "branch",
      childrenIds: [],
      content: "Restored reply",
      metadata: {},
    };
    await flushNodeUpdate();

    expect(addNodes).not.toHaveBeenCalled();
    expect(graph.nodes.value).not.toBe(nodesBefore);
    expect(graph.edges.value.map((edge) => edge.id)).toContain("reply-branch");
  });

  // 保护压缩映射在追加时沿用当前展开状态，避免把新消息接到被摘要替代的成员上。
  it.each([false, true])(
    "connects appended nodes with compression expanded=%s",
    async (expanded) => {
      const session = createCompressionSession();
      const { graph, flow } = mountGraph(session, true);
      await flushNodeUpdate();
      if (expanded) {
        graph.toggleCompressionExpanded("summary");
        await flushNodeUpdate();
      }
      const setNodes = vi.spyOn(flow!, "setNodes");
      session.nodes["next"] = {
        ...session.nodes.tail,
        id: "next",
        parentId: "compressed-2",
        childrenIds: [],
        content: "New branch",
      };
      session.activeLeafId = "next";
      await flushNodeUpdate();

      const sourceId = expanded ? "compressed-2" : "summary";
      expect(flow!.findEdge(sourceId + "-next")?.target).toBe("next");
      expect(flow!.findNode("next")!.data._nodeDepth).toBe(3);
      expect(flow!.findNode("next")!.data.isActiveLeaf).toBe(true);
      expect(flow!.findNode("tail")!.data.isActiveLeaf).toBe(false);
      expect(setNodes).not.toHaveBeenCalled();
    }
  );

  it("updates only branch-path nodes and edges when the active leaf changes", async () => {
    const session = createSession();
    const { graph, updateNodeData, updateEdge } = mountGraph(session);
    const nodesBefore = graph.nodes.value;
    const edgesBefore = graph.edges.value;
    const rootDataBefore = graph.nodes.value.find(
      (node) => node.id === "root"
    )!.data;
    const replyEdge = graph.edges.value.find(
      (edge) => edge.id === "root-reply"
    )!;
    const branchEdge = graph.edges.value.find(
      (edge) => edge.id === "root-branch"
    )!;

    session.activeLeafId = "branch";
    await flushNodeUpdate();

    expect(updateNodeData).toHaveBeenCalledTimes(2);
    expect(updateNodeData).toHaveBeenCalledWith(
      "reply",
      expect.objectContaining({ isActiveLeaf: false })
    );
    expect(updateNodeData).toHaveBeenCalledWith(
      "branch",
      expect.objectContaining({ isActiveLeaf: true })
    );
    expect(updateNodeData).not.toHaveBeenCalledWith("root", expect.anything());
    expect(updateEdge).toHaveBeenCalledTimes(2);
    expect(updateEdge).toHaveBeenCalledWith(
      "root-reply",
      expect.objectContaining({ animated: false })
    );
    expect(updateEdge).toHaveBeenCalledWith(
      "root-branch",
      expect.objectContaining({ animated: true })
    );
    expect(graph.nodes.value).toBe(nodesBefore);
    expect(graph.edges.value).toBe(edgesBefore);
    expect(graph.nodes.value.find((node) => node.id === "root")!.data).toBe(
      rootDataBefore
    );
    expect(replyEdge.animated).toBe(false);
    expect(branchEdge.animated).toBe(true);
  });

  // 保护压缩成员和启用状态变化后的展示、连接与布局输入，无关节点保持原 data。
  it.each([false, true])(
    "reconciles compression membership with expanded=%s",
    async (expanded) => {
      const session = createCompressionSession();
      const { graph, flow } = mountGraph(session, true);
      await flushNodeUpdate();
      if (expanded) {
        graph.toggleCompressionExpanded("summary");
        await flushNodeUpdate();
      }
      const rootDataBefore = flow!.findNode("root")!.data;
      const tailDataBefore = flow!.findNode("tail")!.data;
      const setNodes = vi.spyOn(flow!, "setNodes");
      session.nodes.summary.metadata!.compressedNodeIds = ["compressed-2"];
      await flushNodeUpdate();

      expect(flow!.findNode("compressed-1")!.data.isEnabled).toBe(true);
      expect(flow!.findNode("compressed-2")!.data.isEnabled).toBe(false);
      expect(
        flow!.findEdge(
          (expanded ? "compressed-2" : "compressed-1") + "-summary"
        )
      ).toBeDefined();
      expect(flow!.findEdge("compressed-1-compressed-2")).toBeDefined();
      expect(setNodes).not.toHaveBeenCalled();

      session.nodes.summary.isEnabled = false;
      await flushNodeUpdate();
      expect(flow!.findNode("compressed-2")!.data.isEnabled).toBe(true);
      expect(flow!.findNode("summary")!.data.isEnabled).toBe(false);
      expect(flow!.findEdge("compressed-2-summary")).toBeDefined();

      session.nodes.summary.isEnabled = true;
      await flushNodeUpdate();
      expect(flow!.findNode("compressed-2")!.data.isEnabled).toBe(false);
      expect(flow!.findNode("summary")!.data.isEnabled).toBe(true);
      expect(
        flow!.findEdge(
          (expanded ? "compressed-2" : "compressed-1") + "-summary"
        )
      ).toBeDefined();
      expect(flow!.findNode("root")!.data).toBe(rootDataBefore);
      expect(flow!.findNode("tail")!.data).toBe(tailDataBefore);
      expect(setNodes).not.toHaveBeenCalled();
    }
  );

  it("updates a compression toggle without replacing the node array", () => {
    const session = createCompressionSession();
    const { graph, updateNodeData } = mountGraph(session);
    const nodesBefore = graph.nodes.value;
    const edgesBefore = graph.edges.value;
    const compressedDataBefore = graph.nodes.value.find(
      (node) => node.id === "compressed-2"
    )!.data;
    const tailEdgeBefore = graph.edges.value.find(
      (edge) => edge.id === "summary-tail"
    )!;

    expect(edgesBefore.map((edge) => edge.id)).toEqual([
      "root-compressed-1",
      "summary-compressed-2",
      "root-summary",
      "summary-tail",
    ]);

    graph.toggleCompressionExpanded("summary");

    expect(updateNodeData).toHaveBeenCalledTimes(1);
    expect(updateNodeData).toHaveBeenCalledWith(
      "summary",
      expect.objectContaining({ isExpanded: true })
    );
    expect(graph.nodes.value).toBe(nodesBefore);
    expect(
      graph.nodes.value.find((node) => node.id === "summary")!.data
    ).toEqual(expect.objectContaining({ isExpanded: true }));
    expect(
      graph.nodes.value.find((node) => node.id === "compressed-2")!.data
    ).toBe(compressedDataBefore);
    expect(graph.edges.value.map((edge) => edge.id)).toEqual([
      "root-compressed-1",
      "compressed-1-compressed-2",
      "compressed-2-summary",
      "summary-tail",
    ]);
    expect(graph.edges.value.find((edge) => edge.id === "summary-tail")).toBe(
      tailEdgeBefore
    );

    graph.toggleCompressionExpanded("summary");

    expect(updateNodeData).toHaveBeenCalledTimes(2);
    expect(updateNodeData).toHaveBeenLastCalledWith(
      "summary",
      expect.objectContaining({ isExpanded: false })
    );
    expect(graph.nodes.value).toBe(nodesBefore);
    expect(graph.edges.value.map((edge) => edge.id)).toEqual([
      "root-compressed-1",
      "summary-compressed-2",
      "root-summary",
      "summary-tail",
    ]);
  });
});
