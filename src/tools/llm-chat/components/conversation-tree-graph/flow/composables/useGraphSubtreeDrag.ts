import { reactive, type Ref } from "vue";
import type { ChatSessionDetail, ChatMessageNode } from "../../../../types";
import { useNodeManager } from "../../../../composables/session/useNodeManager";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/composables/useGraphSubtreeDrag");

/**
 * 子树拖拽 Composable
 */
export function useGraphSubtreeDrag(
  sessionRef: () => ChatSessionDetail | null,
  settings: Ref<any>,
  simulationRef: Ref<any>,
  layoutMode: Ref<string>,
  nodes: Ref<any[]>
) {
  const nodeManager = useNodeManager();

  // 用于子树拖拽的状态
  const subtreeDragState = reactive({
    isDragging: false,
    rootNodeId: null as string | null,
    descendantIds: new Set<string>(),
  });

  // 用于手动计算拖拽位移
  const dragPositionState = reactive({
    lastPosition: null as { x: number; y: number } | null,
  });

  /**
   * 处理节点拖拽开始事件
   */
  function handleNodeDragStart(event: any): void {
    const { node, event: domEvent } = event;
    const nodeId = node.id;

    const dragSubtreeModifier = settings.value.graphViewShortcuts.dragSubtree;
    const isDragSubtree =
      (dragSubtreeModifier === "shift" && (domEvent?.shiftKey || false)) ||
      (dragSubtreeModifier === "alt" && (domEvent?.altKey || false)) ||
      (dragSubtreeModifier === "ctrl" && (domEvent?.ctrlKey || false));

    if (isDragSubtree) {
      const session = sessionRef();
      if (session) {
        const descendants = nodeManager.getAllDescendants(session, nodeId);
        subtreeDragState.isDragging = true;
        subtreeDragState.rootNodeId = nodeId;
        subtreeDragState.descendantIds = new Set(
          descendants.map((d: ChatMessageNode) => d.id)
        );
        logger.info(
          `准备拖拽子树，包含 ${subtreeDragState.descendantIds.size} 个子孙节点`,
          { rootNodeId: nodeId }
        );

        // 记录初始位置，用于手动计算位移
        dragPositionState.lastPosition = { ...node.position };
      }
    }

    // 激活模拟 (静态模式除外)
    const simulation = simulationRef.value;
    if (simulation && layoutMode.value !== "static") {
      simulation.alphaTarget(0.3).restart();
    }
  }

  /**
   * 处理节点拖拽中事件
   */
  function handleNodeDrag(event: any): void {
    if (layoutMode.value === "static") return;
    const simulation = simulationRef.value;
    if (!simulation) return;

    const { node } = event;
    const nodeId = node.id;

    // 保持模拟活跃
    if (simulation.alpha() < 0.1) {
      simulation.alpha(0.3).restart();
    }

    // 确保 nodes.value 中的引用是最新的
    const localNodeIndex = nodes.value.findIndex((n) => n.id === nodeId);
    if (localNodeIndex !== -1 && nodes.value[localNodeIndex] !== node) {
      nodes.value[localNodeIndex] = node;
    }

    if (
      subtreeDragState.isDragging &&
      subtreeDragState.rootNodeId &&
      dragPositionState.lastPosition
    ) {
      // 手动计算位移增量
      const movement = {
        x: node.position.x - dragPositionState.lastPosition.x,
        y: node.position.y - dragPositionState.lastPosition.y,
      };

      const allNodeIds = [
        subtreeDragState.rootNodeId,
        ...subtreeDragState.descendantIds,
      ];

      simulation.nodes().forEach((d3Node: any) => {
        if (allNodeIds.includes(d3Node.id)) {
          if (d3Node.id === nodeId) {
            d3Node.fx = node.position.x + d3Node.width / 2;
            d3Node.fy = node.position.y + d3Node.height / 2;
          } else {
            d3Node.x = (d3Node.x ?? 0) + movement.x;
            d3Node.y = (d3Node.y ?? 0) + movement.y;
            d3Node.fx = d3Node.x;
            d3Node.fy = d3Node.y;
          }
        }
      });

      dragPositionState.lastPosition = { ...node.position };
    } else {
      // 只拖拽单个节点
      const d3Node = simulation.nodes().find((n: any) => n.id === nodeId);
      if (d3Node) {
        d3Node.fx = node.position.x + d3Node.width / 2;
        d3Node.fy = node.position.y + d3Node.height / 2;
      }
    }
  }

  /**
   * 处理拖拽结束事件
   */
  function handleNodeDragStop(event: any): void {
    if (layoutMode.value === "static") return;
    const simulation = simulationRef.value;
    if (!simulation) return;

    const draggedNodeId = event.node.id;
    const session = sessionRef();
    if (!session) return;

    const shouldRebound = layoutMode.value === "physics";

    if (subtreeDragState.isDragging) {
      if (shouldRebound) {
        const allNodeIds = [
          subtreeDragState.rootNodeId,
          ...subtreeDragState.descendantIds,
        ];
        simulation.nodes().forEach((d3Node: any) => {
          if (
            allNodeIds.includes(d3Node.id) &&
            (!session.rootNodeId || d3Node.id !== session.rootNodeId)
          ) {
            d3Node.fx = null;
            d3Node.fy = null;
          }
        });
      }
      subtreeDragState.isDragging = false;
      subtreeDragState.rootNodeId = null;
      subtreeDragState.descendantIds.clear();
      dragPositionState.lastPosition = null;
      logger.info("子树拖拽结束");
    } else {
      const d3Node = simulation
        .nodes()
        .find((n: any) => n.id === draggedNodeId);
      if (d3Node) {
        d3Node.x = event.node.position.x + d3Node.width / 2;
        d3Node.y = event.node.position.y + d3Node.height / 2;

        if (shouldRebound) {
          d3Node.fx = null;
          d3Node.fy = null;
        }
      }
    }

    simulation.alphaTarget(0);
  }

  return {
    subtreeDragState,
    dragPositionState,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
  };
}
