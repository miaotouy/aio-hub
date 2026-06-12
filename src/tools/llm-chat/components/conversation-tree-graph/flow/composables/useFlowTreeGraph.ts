import { ref, watch, onUnmounted, type Ref } from "vue";
import { useChatSettings } from "../../../../composables/settings/useChatSettings";
import type { ChatSessionDetail, ChatMessageNode } from "../../../../types";
import { useLlmChatStore } from "../../../../stores/llmChatStore";
import { useAgentStore } from "../../../../stores/agentStore";
import { useUserProfileStore } from "../../../../stores/userProfileStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

// 导入子 Composables 和工具
import * as contentUtils from "./graphContentUtils";
import { useGraphThemePalette } from "./useGraphThemePalette";
import { useGraphShortcuts } from "./useGraphShortcuts";
import { useGraphSubtreeDrag } from "./useGraphSubtreeDrag";
import { useGraphConnectionPreview } from "./useGraphConnectionPreview";
import { useGraphNodeActions } from "./useGraphNodeActions";
import { useGraphD3Simulation, type LayoutMode } from "./useGraphD3Simulation";

const logger = createModuleLogger("llm-chat/composables/useFlowTreeGraph");
const errorHandler = createModuleErrorHandler(
  "llm-chat/composables/useFlowTreeGraph"
);

interface DerivedContentCacheEntry {
  content: string;
  reasoningContent?: string;
  contentPreview: string;
  hasThinking: boolean;
  thinkingPreview: string | null;
}

/**
 * Vue Flow 树图主 Composable
 * 整合所有子模块，管理核心节点/边状态及转换逻辑
 */
export function useFlowTreeGraph(
  sessionRef: () => ChatSessionDetail | null,
  contextMenuState: Ref<any>,
  target: Ref<HTMLElement | null>
) {
  const { settings } = useChatSettings();
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const { getProfileById } = useLlmProfiles();
  const { getModelIcon } = useModelMetadata();

  // 1. 基础状态
  const nodes = ref<any[]>([]);
  const edges = ref<any[]>([]);
  const layoutMode = ref<LayoutMode>("tree");
  const debugMode = ref(false);
  const expandedCompressionIds = ref(new Set<string>());
  const derivedContentCache = new Map<string, DerivedContentCacheEntry>();
  let lastStructureFingerprint = "";

  // 2. 初始化子模块
  const { palette, paletteVersion } = useGraphThemePalette();

  useGraphShortcuts(target, store, settings);

  const {
    simulation,
    d3Nodes,
    d3Links,
    initD3Simulation,
    updateNodeDimensions,
    startWaitingForDimensions,
  } = useGraphD3Simulation(sessionRef, layoutMode, debugMode, nodes, edges);

  const { handleNodeDragStart, handleNodeDrag, handleNodeDragStop } =
    useGraphSubtreeDrag(sessionRef, settings, simulation, layoutMode, nodes);

  const {
    connectionPreviewState,
    handleConnectionStart,
    handleConnectionEnd,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleEdgeConnect,
  } = useGraphConnectionPreview(sessionRef, settings, store, errorHandler);

  const {
    detailPopupState,
    handleNodeContextMenu,
    handleNodeCopy,
    handleNodeToggleEnabled,
    handleNodeDelete,
    handleNodeRegenerate,
    handleNodeCreateBranch,
    handleNodeViewDetail,
    closeDetailPopup,
  } = useGraphNodeActions(sessionRef, contextMenuState, store, errorHandler);

  /**
   * 切换压缩节点的展开/折叠状态
   */
  function toggleCompressionExpanded(nodeId: string) {
    if (expandedCompressionIds.value.has(nodeId)) {
      expandedCompressionIds.value.delete(nodeId);
    } else {
      expandedCompressionIds.value.add(nodeId);
    }
    updateChart();
  }

  /**
   * 计算会话的拓扑结构指纹
   */
  function getStructureFingerprint(session: ChatSessionDetail): string {
    if (!session.nodes) return "not-loaded";
    return Object.values(session.nodes)
      .map((n) => `${n.id}:${n.parentId || ""}`)
      .sort()
      .join("|");
  }

  function buildActivePathSet(session: ChatSessionDetail): Set<string> {
    const activePath = new Set<string>();
    if (!session.nodes || !session.activeLeafId) return activePath;

    let currentId: string | null = session.activeLeafId;
    while (currentId) {
      activePath.add(currentId);
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) break;
      currentId = node.parentId;
    }

    return activePath;
  }

  function buildNodeDepthMap(session: ChatSessionDetail): Map<string, number> {
    const depthMap = new Map<string, number>();
    if (!session.nodes) return depthMap;

    const childrenByParent = new Map<string, string[]>();
    for (const node of Object.values(session.nodes)) {
      if (!node.parentId) continue;
      const children = childrenByParent.get(node.parentId) || [];
      children.push(node.id);
      childrenByParent.set(node.parentId, children);
    }

    const roots =
      session.rootNodeId && session.nodes[session.rootNodeId]
        ? [session.rootNodeId]
        : Object.values(session.nodes)
            .filter((node) => !node.parentId)
            .map((node) => node.id);

    const stack = roots.map((id) => ({ id, depth: 0 }));
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (depthMap.has(current.id)) continue;
      depthMap.set(current.id, current.depth);

      const children = childrenByParent.get(current.id) || [];
      for (const childId of children) {
        stack.push({ id: childId, depth: current.depth + 1 });
      }
    }

    for (const node of Object.values(session.nodes)) {
      if (depthMap.has(node.id)) continue;

      let depth = 0;
      let currentId: string | null = node.id;
      const seen = new Set<string>();
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const parentId: string | null =
          session.nodes[currentId]?.parentId ?? null;
        if (!parentId) break;
        const parentDepth = depthMap.get(parentId);
        if (parentDepth !== undefined) {
          depth += parentDepth + 1;
          break;
        }
        depth++;
        currentId = parentId;
      }
      depthMap.set(node.id, depth);
    }

    return depthMap;
  }

  function getDerivedContent(node: ChatMessageNode): DerivedContentCacheEntry {
    const content = node.content || "";
    const reasoningContent = node.metadata?.reasoningContent;
    const cached = derivedContentCache.get(node.id);
    if (
      cached &&
      cached.content === content &&
      cached.reasoningContent === reasoningContent
    ) {
      return cached;
    }

    const strippedContent = contentUtils.stripThinkingBlocks(content);
    const hasThinking = contentUtils.hasThinkingContent(
      content,
      reasoningContent
    );
    const entry: DerivedContentCacheEntry = {
      content,
      reasoningContent,
      contentPreview: contentUtils.truncateText(strippedContent, 150),
      hasThinking,
      thinkingPreview: hasThinking
        ? contentUtils.extractThinkingPreview(content, reasoningContent)
        : null,
    };
    derivedContentCache.set(node.id, entry);
    return entry;
  }

  /**
   * 根据节点状态计算颜色
   */
  function getNodeColor(
    session: ChatSessionDetail,
    node: ChatMessageNode,
    activePathSet: Set<string>,
    isCompressed: boolean = false
  ): { background: string; border: string } {
    const isOnActivePath = activePathSet.has(node.id);
    const isActiveLeaf =
      !!session.activeLeafId && node.id === session.activeLeafId;
    const isEnabled = node.isEnabled !== false && !isCompressed;

    const roleKey = node.role as "user" | "assistant" | "system" | "tool";
    const roleColors = (palette as any)[roleKey] || palette.inactive;

    if (!isEnabled) {
      return {
        background: palette.disabled.base,
        border: palette.disabled.light,
      };
    }

    let background: string, border: string;

    if (isOnActivePath) {
      background = roleColors.base;
      border = roleColors.light;
    } else {
      background = roleColors.lighter || roleColors.light;
      border = roleColors.light;
    }

    if (isActiveLeaf) {
      border = palette.danger.base;
    }

    return { background, border };
  }

  /**
   * 初始化或更新图表数据
   */
  function updateChart(forceResetPosition: boolean = false): void {
    const session = sessionRef();
    if (!session) {
      nodes.value = [];
      edges.value = [];
      lastStructureFingerprint = "";
      return;
    }

    const currentFingerprint =
      getStructureFingerprint(session) +
      "|" +
      Array.from(expandedCompressionIds.value).sort().join(",");
    const isStructureChanged =
      forceResetPosition || currentFingerprint !== lastStructureFingerprint;

    const previousNodesMap = new Map<string, any>();
    if (!forceResetPosition) {
      for (const n of nodes.value) {
        previousNodesMap.set(n.id, n);
      }
    }

    const activePathSet = buildActivePathSet(session);
    const nodeDepthMap = buildNodeDepthMap(session);

    // --- 预处理压缩节点逻辑 ---
    const compressedNodeIds = new Set<string>();
    const nodeRepMap = new Map<string, string>();
    const logicalParentMap = new Map<string, string>();

    if (session.nodes) {
      Object.values(session.nodes).forEach((node) => {
        if (node.metadata?.isCompressionNode && node.isEnabled !== false) {
          const compressedIds = node.metadata.compressedNodeIds || [];
          const isExpanded = expandedCompressionIds.value.has(node.id);

          if (compressedIds.length > 0) {
            compressedIds.forEach((id) => compressedNodeIds.add(id));
            compressedIds.forEach((id) => {
              if (!isExpanded) nodeRepMap.set(id, node.id);
            });

            const firstNodeId = compressedIds[0];
            const firstNode = session.nodes![firstNodeId];
            if (firstNode && firstNode.parentId) {
              logicalParentMap.set(node.id, firstNode.parentId);
            }
          }
        }
      });
    }

    const getVisibleParentId = (originalParentId: string): string | null => {
      let effectiveParentId = originalParentId;
      // 这里简化处理，目前不考虑多层嵌套压缩
      const rep = nodeRepMap.get(effectiveParentId);
      if (rep) effectiveParentId = rep;
      return effectiveParentId;
    };

    // 转换节点
    const flowNodes: any[] = [];
    if (session.nodes) {
      Object.values(session.nodes).forEach((node) => {
        const isCompressed = compressedNodeIds.has(node.id);
        const isActiveLeaf = node.id === session.activeLeafId;
        const isEnabled = node.isEnabled !== false && !isCompressed;
        const colors = getNodeColor(session, node, activePathSet, isCompressed);
        const roleDisplay = contentUtils.getRoleDisplay(
          node,
          userProfileStore,
          agentStore
        );

        const derivedContent = getDerivedContent(node);

        const subtitleInfo = contentUtils.getSubtitleInfo(
          node,
          agentStore,
          getProfileById,
          getModelIcon
        );
        const attachments = node.attachments || [];
        const isCompressionNode = !!node.metadata?.isCompressionNode;
        const isExpanded = expandedCompressionIds.value.has(node.id);

        let tokens = null;
        if (node.metadata?.usage) {
          tokens = {
            total: node.metadata.usage.totalTokens,
            prompt: node.metadata.usage.promptTokens,
            completion: node.metadata.usage.completionTokens,
          };
        } else if (node.metadata?.contentTokens) {
          tokens = { total: node.metadata.contentTokens };
        }

        let positioningParentId = node.parentId;
        if (isCompressionNode && !isExpanded && logicalParentMap.has(node.id)) {
          positioningParentId = logicalParentMap.get(node.id)!;
        }
        if (positioningParentId) {
          const visibleParent = getVisibleParentId(positioningParentId);
          if (visibleParent) positioningParentId = visibleParent;
        }

        const previousNode = previousNodesMap.get(node.id);
        let initialPosition;

        if (previousNode) {
          initialPosition = { ...previousNode.position };
        } else if (positioningParentId && !forceResetPosition) {
          const parentNode = previousNodesMap.get(positioningParentId);
          if (parentNode) {
            initialPosition = {
              x: parentNode.position.x,
              y: parentNode.position.y + 240,
            };
          } else {
            initialPosition = { x: 0, y: 0 };
          }
        } else {
          initialPosition = { x: 0, y: 0 };
        }

        const agent = node.metadata?.agentId
          ? agentStore.getAgentById(node.metadata.agentId)
          : null;
        const modelId = node.metadata?.modelId || agent?.modelId;
        const profileId = node.metadata?.profileId || agent?.profileId;

        flowNodes.push({
          id: node.id,
          type: "custom",
          position: initialPosition,
          data: {
            name: roleDisplay.name,
            avatar: roleDisplay.icon,
            contentPreview: derivedContent.contentPreview,
            isActiveLeaf,
            isEnabled,
            timestamp: node.timestamp || "",
            role: node.role,
            status: node.status,
            errorMessage: node.metadata?.error,
            subtitleInfo,
            colors,
            tokens,
            attachments,
            _nodeDepth: nodeDepthMap.get(node.id) || 0,
            hasThinking: derivedContent.hasThinking,
            thinkingPreview: derivedContent.thinkingPreview,
            isCompressionNode,
            isExpanded,
            originalMessageCount: node.metadata?.originalMessageCount,
            originalTokenCount: node.metadata?.originalTokenCount,
            modelId,
            profileId,
          },
        });
      });
    }

    // 转换边
    const flowEdges: any[] = [];
    const flowNodeIds = new Set(flowNodes.map((node) => node.id));
    const seenNodeIds = new Set(flowNodeIds);
    for (const cachedNodeId of derivedContentCache.keys()) {
      if (!seenNodeIds.has(cachedNodeId)) {
        derivedContentCache.delete(cachedNodeId);
      }
    }

    flowNodes.forEach((targetNode) => {
      if (!session.nodes) return;
      const node = session.nodes[targetNode.id];
      if (!node) return;

      let rawParentId = node.parentId;
      if (
        targetNode.data.isCompressionNode &&
        !targetNode.data.isExpanded &&
        logicalParentMap.has(node.id)
      ) {
        rawParentId = logicalParentMap.get(node.id)!;
      }

      if (rawParentId) {
        const sourceId = getVisibleParentId(rawParentId);
        if (sourceId && flowNodeIds.has(sourceId)) {
          const isOnActivePath =
            activePathSet.has(sourceId) && activePathSet.has(targetNode.id);

          flowEdges.push({
            id: `${sourceId}-${targetNode.id}`,
            source: sourceId,
            target: targetNode.id,
            animated: isOnActivePath,
            style: {
              stroke: isOnActivePath
                ? (palette as any).edge.active
                : (palette as any).edge.inactive,
              strokeWidth: isOnActivePath ? 2 : 1,
            },
          });
        }
      }
    });

    if (!isStructureChanged && nodes.value.length > 0) {
      nodes.value = flowNodes;
      edges.value = flowEdges;
      return;
    }

    lastStructureFingerprint = currentFingerprint;
    nodes.value = flowNodes;
    edges.value = flowEdges;

    startWaitingForDimensions(flowNodes);
  }

  /**
   * 切换布局模式
   */
  function switchLayoutMode(mode: LayoutMode): void {
    if (layoutMode.value === mode) return;
    layoutMode.value = mode;
    initD3Simulation();
  }

  /**
   * 切换调试模式
   */
  function toggleDebugMode(): void {
    debugMode.value = !debugMode.value;
    if (debugMode.value && simulation.value) {
      d3Nodes.value = [...simulation.value.nodes()];
    }
  }

  /**
   * 重置布局
   */
  function resetLayout(): void {
    updateChart(true);
  }

  /**
   * 清理资源
   */
  function destroy(): void {
    if (simulation.value) {
      simulation.value.stop();
      simulation.value = null;
    }
    logger.info("Vue Flow 树图已销毁");
  }

  // 监听主题变化，刷新节点颜色和边样式
  watch(paletteVersion, () => {
    updateChart();
  });

  onUnmounted(() => {
    destroy();
  });

  /**
   * 处理双击事件 - 切换分支
   */
  function handleNodeDoubleClick(event: any): void {
    const nodeId = event.node.id;
    logger.info("双击节点，切换分支", { nodeId });

    try {
      store.switchBranch(nodeId);
    } catch (error) {
      errorHandler.error(error, "切换分支失败");
    }
  }

  return {
    nodes,
    edges,
    layoutMode,
    debugMode,
    d3Nodes,
    d3Links,
    detailPopupState,
    connectionPreviewState,
    handleNodeDoubleClick,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleEdgeConnect,
    handleConnectionStart,
    handleConnectionEnd,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleNodeContextMenu,
    handleNodeCopy,
    handleNodeToggleEnabled,
    handleNodeDelete,
    handleNodeRegenerate,
    handleNodeCreateBranch,
    handleNodeViewDetail,
    closeDetailPopup,
    updateChart,
    updateNodeDimensions,
    switchLayoutMode,
    resetLayout,
    toggleDebugMode,
    toggleCompressionExpanded,
    destroy,
  };
}
