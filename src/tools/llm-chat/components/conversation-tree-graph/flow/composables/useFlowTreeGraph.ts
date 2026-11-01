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

import {
  ref,
  shallowRef,
  watch,
  onUnmounted,
  type Ref,
  type WatchStopHandle,
} from "vue";
import { usePageActivity } from "@/composables/usePageActivity";
import { useChatSettings } from "../../../../composables/settings/useChatSettings";
import type { ChatSessionDetail, ChatMessageNode } from "../../../../types";
import { useLlmChatStore } from "../../../../stores/llmChatStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
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

interface GraphRenderContext {
  activePathSet: Set<string>;
  nodeDepthMap: Map<string, number>;
  compressedNodeIds: Set<string>;
  logicalParentMap: Map<string, string>;
}

type NodeDataUpdater = (id: string, data: any) => boolean;

const EMPTY_ATTACHMENTS = Object.freeze([]) as readonly any[];

function isTokenInfoEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.total === b.total &&
    a.prompt === b.prompt &&
    a.completion === b.completion
  );
}

function isSubtitleInfoEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.profileName === b.profileName &&
    a.profileIcon === b.profileIcon &&
    a.modelName === b.modelName &&
    a.modelIcon === b.modelIcon
  );
}

function isColorInfoEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.background === b.background && a.border === b.border;
}

function isNodeDataEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.contentPreview === b.contentPreview &&
    a.isActiveLeaf === b.isActiveLeaf &&
    a.isEnabled === b.isEnabled &&
    a.timestamp === b.timestamp &&
    a.role === b.role &&
    a.status === b.status &&
    a.errorMessage === b.errorMessage &&
    isSubtitleInfoEqual(a.subtitleInfo, b.subtitleInfo) &&
    isColorInfoEqual(a.colors, b.colors) &&
    isTokenInfoEqual(a.tokens, b.tokens) &&
    a.attachments === b.attachments &&
    a._nodeDepth === b._nodeDepth &&
    a.hasThinking === b.hasThinking &&
    a.thinkingPreview === b.thinkingPreview &&
    a.isCompressionNode === b.isCompressionNode &&
    a.isExpanded === b.isExpanded &&
    a.originalMessageCount === b.originalMessageCount &&
    a.originalTokenCount === b.originalTokenCount &&
    a.modelId === b.modelId &&
    a.profileId === b.profileId
  );
}

function getReusableNodeData(previousNode: any, nextData: any): any {
  return isNodeDataEqual(previousNode?.data, nextData)
    ? previousNode.data
    : nextData;
}

function getAttachmentWatchSignature(attachments?: any[]): string {
  if (!attachments?.length) return "";

  return attachments
    .map((asset) => {
      const derived = asset.metadata?.derived
        ? Object.entries(asset.metadata.derived)
            .map(([key, value]: [string, any]) =>
              [
                key,
                value?.path,
                value?.updatedAt,
                value?.provider,
                value?.error,
                value?.warning,
              ].join(":")
            )
            .join(",")
        : "";

      return [
        asset.id,
        asset.uploadingId,
        asset.type,
        asset.mimeType,
        asset.name,
        asset.path,
        asset.thumbnailPath,
        asset.size,
        asset.importStatus,
        asset.importError,
        asset.importPhase,
        asset.importPhaseDetail,
        asset.metadata?.width,
        asset.metadata?.height,
        asset.metadata?.duration,
        asset.metadata?.sha256,
        asset.metadata?.originalSha256,
        derived,
      ].join(":");
    })
    .join("|");
}

function isEdgeStyleEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.stroke === b.stroke && a.strokeWidth === b.strokeWidth;
}

function isEdgeEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.source === b.source &&
    a.target === b.target &&
    a.animated === b.animated &&
    isEdgeStyleEqual(a.style, b.style)
  );
}

/**
 * Vue Flow 树图主 Composable
 * 整合所有子模块，管理核心节点/边状态及转换逻辑
 */
export function useFlowTreeGraph(
  sessionRef: () => ChatSessionDetail | null,
  contextMenuState: Ref<any>,
  target: Ref<HTMLElement | null>,
  nodeDataUpdater?: NodeDataUpdater
) {
  const { settings } = useChatSettings();
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const { getProfileById } = useLlmProfiles();
  const { getModelIcon, getDisplayIconPath } = useModelMetadata();

  // 1. 基础状态
  const nodes = shallowRef<any[]>([]);
  const edges = shallowRef<any[]>([]);
  const layoutMode = ref<LayoutMode>("tree");
  const debugMode = ref(false);
  const expandedCompressionIds = shallowRef(new Set<string>());
  const derivedContentCache = new Map<string, DerivedContentCacheEntry>();
  const nodeWatchStops = new Map<string, WatchStopHandle>();
  const dirtyNodeIds = new Set<string>();
  let dirtyFlushScheduled = false;
  let flowNodeById = new Map<string, any>();
  let renderContext: GraphRenderContext = {
    activePathSet: new Set(),
    nodeDepthMap: new Map(),
    compressedNodeIds: new Set(),
    logicalParentMap: new Map(),
  };
  let lastStructureFingerprint = "";
  const isPageActive = usePageActivity();

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
  } = useGraphD3Simulation(
    sessionRef,
    layoutMode,
    debugMode,
    nodes,
    edges,
    isPageActive
  );

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
    if (!session.nodes) return `${session.id}:${session.rootNodeId}:not-loaded`;
    const topology = Object.values(session.nodes)
      .map((n) => `${n.id}:${n.parentId || ""}`)
      .sort()
      .join("|");
    return `${session.id}:${session.rootNodeId}:${topology}`;
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

  function createNodeData(
    session: ChatSessionDetail,
    node: ChatMessageNode,
    context: GraphRenderContext
  ): any {
    const isCompressed = context.compressedNodeIds.has(node.id);
    const isActiveLeaf = node.id === session.activeLeafId;
    const isEnabled = node.isEnabled !== false && !isCompressed;
    const colors = getNodeColor(
      session,
      node,
      context.activePathSet,
      isCompressed
    );
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
      getModelIcon,
      getDisplayIconPath
    );
    const attachments = node.attachments || EMPTY_ATTACHMENTS;
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

    const agent = node.metadata?.agentId
      ? agentStore.getAgentById(node.metadata.agentId)
      : null;

    return {
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
      _nodeDepth: context.nodeDepthMap.get(node.id) || 0,
      hasThinking: derivedContent.hasThinking,
      thinkingPreview: derivedContent.thinkingPreview,
      isCompressionNode,
      isExpanded,
      originalMessageCount: node.metadata?.originalMessageCount,
      originalTokenCount: node.metadata?.originalTokenCount,
      modelId: node.metadata?.modelId || agent?.modelId,
      profileId: node.metadata?.profileId || agent?.profileId,
    };
  }

  function getNodeContentWatchSources(nodeId: string): Array<() => unknown> {
    const getNode = () => sessionRef()?.nodes?.[nodeId];

    return [
      () => getNode()?.content,
      () => getNode()?.metadata?.reasoningContent,
      () => getNode()?.role,
      () => getNode()?.status,
      () => getNode()?.isEnabled,
      () => getNode()?.timestamp,
      () => getAttachmentWatchSignature(getNode()?.attachments),
      () => getNode()?.metadata?.error,
      () => getNode()?.metadata?.agentId,
      () => getNode()?.metadata?.agentName,
      () => getNode()?.metadata?.agentIcon,
      () => getNode()?.metadata?.profileId,
      () => getNode()?.metadata?.modelId,
      () => getNode()?.metadata?.modelName,
      () => getNode()?.metadata?.modelIcon,
      () => getNode()?.metadata?.userProfileId,
      () => getNode()?.metadata?.userProfileName,
      () => getNode()?.metadata?.userProfileIcon,
      () => getNode()?.metadata?.contentTokens,
      () => getNode()?.metadata?.usage?.totalTokens,
      () => getNode()?.metadata?.usage?.promptTokens,
      () => getNode()?.metadata?.usage?.completionTokens,
      () => getNode()?.metadata?.originalMessageCount,
      () => getNode()?.metadata?.originalTokenCount,
      () => getNode()?.metadata?.toolCalls?.[0]?.toolName,
      () => getNode()?.metadata?.toolCall?.toolName,
    ];
  }

  function syncNodeContentWatchers(session: ChatSessionDetail | null): void {
    const nodeIds = new Set(session?.nodes ? Object.keys(session.nodes) : []);

    for (const [nodeId, stop] of nodeWatchStops) {
      if (nodeIds.has(nodeId)) continue;
      stop();
      nodeWatchStops.delete(nodeId);
    }

    for (const nodeId of nodeIds) {
      if (nodeWatchStops.has(nodeId)) continue;

      const stop = watch(getNodeContentWatchSources(nodeId), () => {
        scheduleNodeDataFlush(nodeId);
      });
      nodeWatchStops.set(nodeId, stop);
    }
  }

  function scheduleNodeDataFlush(nodeId: string): void {
    if (!isPageActive.value) return;

    dirtyNodeIds.add(nodeId);
    if (dirtyFlushScheduled) return;

    dirtyFlushScheduled = true;
    queueMicrotask(() => {
      dirtyFlushScheduled = false;
      flushDirtyNodeData();
    });
  }

  function flushDirtyNodeData(): void {
    if (dirtyNodeIds.size === 0 || !isPageActive.value) return;

    const session = sessionRef();
    if (!session?.nodes) {
      dirtyNodeIds.clear();
      return;
    }

    const pendingIds = Array.from(dirtyNodeIds);
    dirtyNodeIds.clear();

    for (const nodeId of pendingIds) {
      const node = session.nodes[nodeId];
      const flowNode = flowNodeById.get(nodeId);
      if (!node || !flowNode) continue;

      const nextData = createNodeData(session, node, renderContext);
      if (isNodeDataEqual(flowNode.data, nextData)) continue;

      if (nodeDataUpdater && !nodeDataUpdater(nodeId, nextData)) {
        dirtyNodeIds.add(nodeId);
        updateChart();
        return;
      }

      flowNode.data = nextData;
    }
  }

  /**
   * 初始化或更新图表数据
   */
  function updateChart(forceResetPosition: boolean = false): void {
    if (!isPageActive.value) return;
    const session = sessionRef();
    if (!session) {
      syncNodeContentWatchers(null);
      dirtyNodeIds.clear();
      flowNodeById = new Map();
      renderContext = {
        activePathSet: new Set(),
        nodeDepthMap: new Map(),
        compressedNodeIds: new Set(),
        logicalParentMap: new Map(),
      };
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
    const previousEdgesMap = new Map<string, any>();
    if (!forceResetPosition) {
      for (const n of nodes.value) {
        previousNodesMap.set(n.id, n);
      }
      for (const edge of edges.value) {
        previousEdgesMap.set(edge.id, edge);
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

    renderContext = {
      activePathSet,
      nodeDepthMap,
      compressedNodeIds,
      logicalParentMap,
    };

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
        const isCompressionNode = !!node.metadata?.isCompressionNode;
        const isExpanded = expandedCompressionIds.value.has(node.id);

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

        const nextData = createNodeData(session, node, renderContext);
        const data = getReusableNodeData(previousNode, nextData);
        const nextFlowNode = {
          id: node.id,
          type: "custom",
          position: initialPosition,
          data,
        };

        if (
          previousNode &&
          previousNode.type === nextFlowNode.type &&
          previousNode.position?.x === nextFlowNode.position.x &&
          previousNode.position?.y === nextFlowNode.position.y &&
          previousNode.data === data
        ) {
          flowNodes.push(previousNode);
        } else {
          flowNodes.push({ ...previousNode, ...nextFlowNode });
        }
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

          const edgeStyle = {
            stroke: isOnActivePath
              ? (palette as any).edge.active
              : (palette as any).edge.inactive,
            strokeWidth: isOnActivePath ? 2 : 1,
          };
          const nextEdge = {
            id: `${sourceId}-${targetNode.id}`,
            source: sourceId,
            target: targetNode.id,
            animated: isOnActivePath,
            style: edgeStyle,
          };
          const previousEdge = previousEdgesMap.get(nextEdge.id);
          flowEdges.push(
            isEdgeEqual(previousEdge, nextEdge) ? previousEdge : nextEdge
          );
        }
      }
    });

    const edgesChanged =
      flowEdges.length !== edges.value.length ||
      flowEdges.some((edge, index) => edge !== edges.value[index]);

    if (!isStructureChanged && nodes.value.length > 0) {
      let dataUpdatesSucceeded = true;

      for (const nextNode of flowNodes) {
        const currentNode = flowNodeById.get(nextNode.id);
        if (!currentNode) {
          dataUpdatesSucceeded = false;
          break;
        }

        if (currentNode.data === nextNode.data) continue;
        if (nodeDataUpdater && !nodeDataUpdater(nextNode.id, nextNode.data)) {
          dataUpdatesSucceeded = false;
          break;
        }
        currentNode.data = nextNode.data;
      }

      if (dataUpdatesSucceeded) {
        if (edgesChanged) edges.value = flowEdges;
        syncNodeContentWatchers(session);
        return;
      }

      nodes.value = flowNodes;
      edges.value = flowEdges;
      flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
      syncNodeContentWatchers(session);
      return;
    }

    lastStructureFingerprint = currentFingerprint;
    nodes.value = flowNodes;
    edges.value = flowEdges;
    flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));

    startWaitingForDimensions(flowNodes, forceResetPosition);
    syncNodeContentWatchers(session);
  }

  function getGraphStructureWatchSource(): unknown[] {
    const session = sessionRef();
    if (!session) return [null];

    const nodeEntries = session.nodes
      ? Object.values(session.nodes).sort((a, b) => a.id.localeCompare(b.id))
      : [];
    const parts: unknown[] = [
      session.id,
      session.rootNodeId,
      session.activeLeafId,
      nodeEntries.length,
    ];

    for (const node of nodeEntries) {
      parts.push(
        node.id,
        node.parentId,
        node.metadata?.isCompressionNode,
        node.metadata?.isCompressionNode ? node.isEnabled : undefined,
        node.metadata?.compressedNodeIds?.join(",")
      );
    }

    return parts;
  }

  watch(getGraphStructureWatchSource, () => {
    updateChart();
  });

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
    for (const stop of nodeWatchStops.values()) stop();
    nodeWatchStops.clear();
    dirtyNodeIds.clear();
    dirtyFlushScheduled = false;

    if (simulation.value) {
      simulation.value.stop();
      simulation.value = null;
    }
    logger.info("Vue Flow 树图已销毁");
  }

  watch(isPageActive, (active) => {
    if (active) updateChart();
  });

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
