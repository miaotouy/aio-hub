// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ref, reactive, type Ref } from "vue";
import * as d3Force from "d3-force";
import { stratify, tree, type HierarchyNode } from "d3-hierarchy";
import type { ChatSessionDetail, ChatMessageNode } from "../../../../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/composables/useGraphD3Simulation");

/**
 * D3 力导向节点类型
 */
export interface D3Node extends d3Force.SimulationNodeDatum {
  id: string;
  depth: number;
  width: number;
  height: number;
  isActiveLeaf: boolean;
  isEnabled: boolean;
}

/**
 * D3 力导向边类型
 */
export interface D3Link extends d3Force.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  _debug?: {
    strength: number;
    distance: number;
  };
}

/**
 * 布局模式类型
 */
export type LayoutMode = "tree" | "physics" | "static";

/**
 * 自定义 D3 力：模拟持续的重力加速度
 */
function gravityForce(strength: number) {
  let nodes: D3Node[];

  function force(alpha: number) {
    for (const node of nodes) {
      if (node.fy == null) {
        node.vy = (node.vy || 0) + strength * alpha;
      }
    }
  }

  force.initialize = (_: D3Node[]) => {
    nodes = _;
  };

  force.strength = (_?: number) => {
    if (_ === undefined) return strength;
    strength = +_;
    return force;
  };

  return force;
}

/**
 * 计算每个节点的直接子节点数
 */
function calculateDirectChildrenCount(
  nodes: Record<string, ChatMessageNode> | undefined
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!nodes) return counts;

  for (const nodeId in nodes) {
    counts.set(nodeId, 0);
  }

  for (const node of Object.values(nodes)) {
    if (node.parentId && counts.has(node.parentId)) {
      counts.set(node.parentId, (counts.get(node.parentId) || 0) + 1);
    }
  }

  return counts;
}

/**
 * D3 仿真与布局 Composable
 */
export function useGraphD3Simulation(
  sessionRef: () => ChatSessionDetail | null,
  layoutMode: Ref<LayoutMode>,
  debugMode: Ref<boolean>,
  nodes: Ref<any[]>,
  edges: Ref<any[]>
) {
  // D3 力模拟实例
  const simulation = ref<d3Force.Simulation<D3Node, D3Link> | null>(null);
  const d3Nodes = ref<D3Node[]>([]);
  const d3Links = ref<D3Link[]>([]);

  // 节点真实尺寸缓存
  const measuredDimensions = reactive(
    new Map<string, { width: number; height: number }>()
  );
  // 是否正在等待节点尺寸更新
  const isWaitingForDimensions = ref(false);
  // 等待尺寸更新的节点 ID 集合
  const pendingNodeIds = ref(new Set<string>());
  // 布局超时定时器
  let layoutTimeoutId: any = null;
  let lastVueNodesArray: any[] | null = null;
  let vueNodeById = new Map<string, any>();

  function getVueNodeById(): Map<string, any> {
    if (lastVueNodesArray !== nodes.value) {
      lastVueNodesArray = nodes.value;
      vueNodeById = new Map(nodes.value.map((node) => [node.id, node]));
    }
    return vueNodeById;
  }

  /**
   * 初始化 D3 力导向模拟
   */
  function initD3Simulation(): void {
    const session = sessionRef();
    if (!session || nodes.value.length === 0) return;

    const levelGap = 280;
    const existingD3NodeMap = new Map(
      simulation.value?.nodes().map((node) => [node.id, node]) ?? []
    );

    // 准备 D3 数据
    d3Nodes.value = nodes.value.map((n) => {
      const existingD3Node = existingD3NodeMap.get(n.id);
      const measured = measuredDimensions.get(n.id);

      const baseHeight = 140;
      const attachmentHeight = (n.data.attachments?.length || 0) * 160;
      const estimatedHeight = baseHeight + attachmentHeight;

      const finalWidth = measured?.width || existingD3Node?.width || 220;
      const finalHeight =
        measured?.height || existingD3Node?.height || estimatedHeight;

      return {
        id: n.id,
        depth: n.data._nodeDepth || 0, // 假设在 updateChart 中计算并注入了深度
        width: finalWidth,
        height: finalHeight,
        isActiveLeaf: n.data.isActiveLeaf,
        isEnabled: n.data.isEnabled,
        x: n.position.x + finalWidth / 2,
        y: n.position.y + finalHeight / 2,
        ...(!n.position.x &&
          !n.position.y && { y: (n.data._nodeDepth || 0) * levelGap }),
      };
    });

    if (simulation.value) {
      simulation.value.stop();
    }

    // --- 1. 确定性布局计算 ---
    const nodeWidth = 220;
    const nodeHorizontalPadding = 120;

    if (!session.nodes) return;
    const rootHierarchy = stratify<ChatMessageNode>()
      .id((d: ChatMessageNode) => d.id)
      .parentId((d: ChatMessageNode) => d.parentId)(
      Object.values(session.nodes)
    );

    const treeLayout = tree<ChatMessageNode>().nodeSize([
      nodeWidth + nodeHorizontalPadding,
      levelGap,
    ]);
    treeLayout(rootHierarchy);

    const calculatedPositions = new Map<string, { x: number; y: number }>();
    rootHierarchy.each((d: HierarchyNode<ChatMessageNode>) => {
      calculatedPositions.set(d.id!, { x: d.x ?? 0, y: d.y ?? 0 });
    });

    // --- 2. 动态链接配置 ---
    const childrenCount = calculateDirectChildrenCount(session.nodes);
    d3Links.value = edges.value.map((e) => {
      const sourceNodeId = e.source;
      const weight = childrenCount.get(sourceNodeId) || 0;
      const isPhysics = layoutMode.value === "physics";
      const baseDistance = isPhysics ? 180 : 80;
      const extraDistancePerNode = 30;
      const maxExtraDistance = 420;
      const distance =
        baseDistance +
        Math.min(weight * extraDistancePerNode, maxExtraDistance);

      return {
        source: e.source,
        target: e.target,
        _debug: {
          strength: isPhysics ? 0.4 : 0.2,
          distance: Math.round(distance),
        },
      };
    });

    // --- 3. 创建或更新模拟 ---
    if (!simulation.value) {
      simulation.value = d3Force.forceSimulation<D3Node, D3Link>();
      logger.info("首次创建 D3 力模拟实例");
    }
    const sim = simulation.value;
    sim.nodes(d3Nodes.value);

    // --- 4. 配置力 ---
    sim.force(
      "collide",
      d3Force
        .forceCollide<D3Node>((d) => Math.max(d.width, d.height) / 2 + 40)
        .strength(1)
    );
    sim.force(
      "link",
      d3Force
        .forceLink<D3Node, D3Link>(d3Links.value)
        .id((d) => d.id)
        .distance((link) => link._debug?.distance ?? 150)
        .strength((link) => link._debug?.strength ?? 0.4)
    );

    if (layoutMode.value === "static") {
      // 静态模式：水平位置使用 tree() 计算结果，垂直位置根据实际节点高度按层级累加
      // 这样有图片附件等大内容的节点能正确撑开层级间距

      // 1. 按深度分组节点，收集每层的最大高度
      const depthGroups = new Map<number, D3Node[]>();
      for (const d3Node of d3Nodes.value) {
        const group = depthGroups.get(d3Node.depth) || [];
        group.push(d3Node);
        depthGroups.set(d3Node.depth, group);
      }

      // 2. 计算每层的最大节点高度
      const maxDepth = Math.max(...Array.from(depthGroups.keys()), 0);
      const layerMaxHeights = new Map<number, number>();
      for (let depth = 0; depth <= maxDepth; depth++) {
        const group = depthGroups.get(depth) || [];
        const maxHeight = group.reduce(
          (max, node) => Math.max(max, node.height),
          140
        );
        layerMaxHeights.set(depth, maxHeight);
      }

      // 3. 累加计算每层的 y 中心坐标
      const verticalGap = 60; // 层级之间的固定间距
      const layerCenterY = new Map<number, number>();
      let currentY = 0;
      for (let depth = 0; depth <= maxDepth; depth++) {
        const layerHeight = layerMaxHeights.get(depth) || 140;
        // 当前层的中心 y = 累加偏移 + 当前层高度的一半
        layerCenterY.set(depth, currentY + layerHeight / 2);
        // 下一层的起始 y = 当前层底部 + 间距
        currentY += layerHeight + verticalGap;
      }

      // 4. 应用位置：x 来自 tree() 计算，y 来自层级累加
      const nodeById = getVueNodeById();
      for (const d3Node of d3Nodes.value) {
        const vueNode = nodeById.get(d3Node.id);
        const treePos = calculatedPositions.get(d3Node.id);
        const centerY = layerCenterY.get(d3Node.depth) ?? 0;
        if (vueNode && treePos) {
          vueNode.position.x = treePos.x - d3Node.width / 2;
          vueNode.position.y = centerY - d3Node.height / 2;
          d3Node.x = treePos.x;
          d3Node.y = centerY;
        }
      }
      sim.stop();
      logger.info("静态布局已应用（自适应节点高度）");
      return;
    }

    if (layoutMode.value === "tree") {
      sim
        .alpha(1)
        .restart()
        .alphaDecay(0.04)
        .velocityDecay(0.5)
        .force("charge", null)
        .force(
          "x",
          d3Force
            .forceX<D3Node>((d) => calculatedPositions.get(d.id)?.x ?? d.x ?? 0)
            .strength(0.15)
        )
        .force(
          "y",
          d3Force
            .forceY<D3Node>((d) => calculatedPositions.get(d.id)?.y ?? d.y ?? 0)
            .strength(0.25)
        );

      sim.nodes().forEach((n) => {
        n.fx = null;
        n.fy = null;
      });
    } else {
      sim
        .alpha(1)
        .restart()
        .alphaDecay(0.0228)
        .velocityDecay(0.4)
        .force("charge", d3Force.forceManyBody().strength(-400))
        .force("y", null)
        .force("x", d3Force.forceX(0).strength(0.005))
        .force("gravity", gravityForce(6));

      sim.nodes().forEach((n) => {
        if (n.id !== session.rootNodeId) {
          n.fx = null;
          n.fy = null;
        }
      });
      const d3NodeById = new Map(sim.nodes().map((node) => [node.id, node]));
      const rootNode = session.rootNodeId
        ? d3NodeById.get(session.rootNodeId)
        : null;
      const rootPos = session.rootNodeId
        ? calculatedPositions.get(session.rootNodeId)
        : null;
      if (rootNode && rootPos) {
        rootNode.fx = rootPos.x;
        rootNode.fy = rootPos.y;
      }
    }

    sim.on("tick", () => {
      if (debugMode.value) {
        d3Nodes.value = [...sim.nodes()];
      }
      const nodeById = getVueNodeById();
      for (const d3Node of sim.nodes()) {
        const vueNode = nodeById.get(d3Node.id);
        if (vueNode) {
          vueNode.position.x = (d3Node.x || 0) - d3Node.width / 2;
          vueNode.position.y = (d3Node.y || 0) - d3Node.height / 2;
        }
      }
    });

    sim.on("end", () => {
      logger.info("D3 力模拟结束");
    });
  }

  /**
   * 更新节点尺寸
   */
  function updateNodeDimensions(
    dimensions: Map<string, { width: number; height: number }>
  ) {
    for (const [id, dim] of dimensions) {
      measuredDimensions.set(id, dim);
    }

    if (isWaitingForDimensions.value) {
      for (const id of dimensions.keys()) {
        pendingNodeIds.value.delete(id);
      }

      if (pendingNodeIds.value.size === 0) {
        logger.info("所有节点尺寸已就位，开始初始布局");
        isWaitingForDimensions.value = false;
        if (layoutTimeoutId) {
          clearTimeout(layoutTimeoutId);
          layoutTimeoutId = null;
        }
        initD3Simulation();
      }
      return;
    }

    if (!simulation.value) return;

    let needsRestart = false;
    simulation.value.nodes().forEach((d3Node) => {
      const dim = dimensions.get(d3Node.id);
      if (dim && (d3Node.width !== dim.width || d3Node.height !== dim.height)) {
        d3Node.width = dim.width;
        d3Node.height = dim.height;
        needsRestart = true;
      }
    });

    if (needsRestart) {
      if (layoutMode.value === "static") {
        // 静态模式下，尺寸变化只需重新应用静态布局逻辑，无需启动物理仿真
        initD3Simulation();
      } else {
        simulation.value.alpha(0.3).restart();
      }
    }
  }

  function startWaitingForDimensions(flowNodes: any[]) {
    if (layoutTimeoutId) {
      clearTimeout(layoutTimeoutId);
      layoutTimeoutId = null;
    }

    const pendingIds = flowNodes
      .map((n) => n.id)
      .filter((id) => !measuredDimensions.has(id));

    if (pendingIds.length === 0) {
      isWaitingForDimensions.value = false;
      pendingNodeIds.value.clear();
      initD3Simulation();
      return;
    }

    isWaitingForDimensions.value = true;
    pendingNodeIds.value = new Set(pendingIds);

    layoutTimeoutId = setTimeout(() => {
      if (isWaitingForDimensions.value) {
        logger.warn("等待节点尺寸超时，强制开始布局");
        isWaitingForDimensions.value = false;
        pendingNodeIds.value.clear();
        initD3Simulation();
      }
    }, 300);
  }

  return {
    simulation,
    d3Nodes,
    d3Links,
    measuredDimensions,
    isWaitingForDimensions,
    initD3Simulation,
    updateNodeDimensions,
    startWaitingForDimensions,
  };
}
