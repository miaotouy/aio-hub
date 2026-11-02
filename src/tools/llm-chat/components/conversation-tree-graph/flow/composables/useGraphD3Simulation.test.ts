// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionDetail } from "../../../../types";
import { useGraphD3Simulation } from "./useGraphD3Simulation";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
}));

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function createGraph(active = ref(true)) {
  const session = {
    id: "session",
    rootNodeId: "root",
    activeLeafId: "reply",
    nodes: {
      root: { id: "root", parentId: null },
      reply: { id: "reply", parentId: "root" },
    },
  } as unknown as ChatSessionDetail;
  const nodes = ref(
    ["root", "reply"].map((id, depth) => ({
      id,
      position: { x: 100, y: depth * 300 },
      data: { _nodeDepth: depth, isEnabled: true, isActiveLeaf: depth === 1 },
    }))
  );
  const graph = useGraphD3Simulation(
    () => session,
    ref("physics"),
    ref(false),
    nodes,
    ref([{ source: "root", target: "reply" }]),
    active
  );
  graph.updateNodeDimensions(
    new Map([
      ["root", { width: 220, height: 140 }],
      ["reply", { width: 220, height: 140 }],
    ])
  );
  graph.initD3Simulation();
  const sim = graph.simulation.value!;
  sim.stop();
  cleanups.push(() => sim.stop());
  return { graph, sim, nodes };
}

// 防护流式内容增高时布局反复升温与节点跳位，结构变化仍可启动布局。
describe("physics layout content updates", () => {
  it.each([0, 0.08])(
    "keeps layout temperature and positions when content resizes at alpha %s",
    (alpha) => {
      const { graph, sim, nodes } = createGraph();
      sim.alpha(alpha);
      const before = sim.nodes().map((node) => ({
        id: node.id,
        x: node.x! - node.width / 2,
        y: node.y! - node.height / 2,
        vx: node.vx,
        vy: node.vy,
      }));
      const rootBefore = sim.nodes().find((node) => node.id === "root")!;
      const fixedPosition = {
        x: rootBefore.fx! - rootBefore.width / 2,
        y: rootBefore.fy! - rootBefore.height / 2,
      };
      graph.updateNodeDimensions(
        new Map([
          ["root", { width: 260, height: 180 }],
          ["reply", { width: 220, height: 360 }],
        ])
      );
      expect(sim.alpha()).toBe(alpha);
      for (const expected of before) {
        const node = sim.nodes().find((node) => node.id === expected.id)!;
        expect({
          id: node.id,
          x: node.x! - node.width / 2,
          y: node.y! - node.height / 2,
          vx: node.vx,
          vy: node.vy,
        }).toEqual(expected);
        expect(
          nodes.value.find((item) => item.id === node.id)!.position
        ).toEqual({ x: expected.x, y: expected.y });
      }
      const root = sim.nodes().find((node) => node.id === "root")!;
      expect(root.fx! - root.width / 2).toBe(fixedPosition.x);
      expect(root.fy! - root.height / 2).toBe(fixedPosition.y);
      expect(sim.nodes().find((node) => node.id === "reply")!.height).toBe(360);
    }
  );

  it("continues from current simulation state when topology changes and honors an explicit reset", () => {
    const { graph, sim, nodes } = createGraph();
    const current = sim.nodes().find((node) => node.id === "reply")!;
    Object.assign(current, { x: 720, y: 840, vx: 2, vy: -3 });
    const rootNode = sim.nodes().find((node) => node.id === "root")!;
    Object.assign(rootNode, { x: 350, y: 400, fx: 350, fy: 400 });
    graph.startWaitingForDimensions(nodes.value);
    sim.stop();
    expect(sim.nodes().find((node) => node.id === "reply")).toMatchObject({
      x: 720,
      y: 840,
      vx: 2,
      vy: -3,
    });
    expect(sim.nodes().find((node) => node.id === "root")).toMatchObject({
      x: 350,
      y: 400,
      fx: 350,
      fy: 400,
    });
    graph.startWaitingForDimensions(nodes.value, true);
    sim.stop();
    expect(sim.nodes().find((node) => node.id === "reply")).toMatchObject({
      x: 210,
      y: 370,
      vx: 0,
      vy: 0,
    });
  });

  it("can start a new layout after the settled graph is explicitly rebuilt", () => {
    const { graph, sim, nodes } = createGraph();
    sim.alpha(0);
    graph.startWaitingForDimensions(nodes.value);
    sim.stop();
    expect(sim.alpha()).toBe(1);
  });
});

// 防护隐藏页面反复启动布局，恢复时继续原来的位置与温度。
it("pauses D3 while hidden, defers rebuilds and preserves settled layouts on return", () => {
  const active = ref(true);
  const { graph, sim, nodes } = createGraph(active);
  sim.alpha(0);
  const restart = vi.spyOn(sim, "restart");
  active.value = false;
  graph.updateNodeDimensions(new Map([["root", { width: 0, height: 0 }]]));
  expect(sim.nodes()[0].width).toBe(220);
  active.value = true;
  expect(restart).not.toHaveBeenCalled();
  active.value = false;
  graph.startWaitingForDimensions(nodes.value, true);
  expect(graph.simulation.value).toBe(sim);
  expect(sim.alpha()).toBe(0);
  active.value = true;
  graph.simulation.value?.stop();
  expect(graph.simulation.value?.alpha()).toBe(1);
});
