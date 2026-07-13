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

import { reactive, type Ref } from "vue";
import { useMagicKeys } from "@vueuse/core";
import type { ChatSessionDetail } from "../../../../types";
import { useNodeManager } from "../../../../composables/session/useNodeManager";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger(
  "llm-chat/composables/useGraphConnectionPreview"
);

/**
 * 连接预览状态
 */
export interface ConnectionPreviewState {
  isConnecting: boolean; // 是否正在连接中
  sourceNodeId: string | null; // 连接的源节点 ID
  targetNodeId: string | null; // 当前悬停的目标节点 ID
  isTargetValid: boolean; // 目标节点是否有效
  isGrafting: boolean; // 是否为嫁接子树模式
}

/**
 * 连接预览与嫁接交互 Composable
 */
export function useGraphConnectionPreview(
  sessionRef: () => ChatSessionDetail | null,
  settings: Ref<any>,
  store: any,
  errorHandler: any
) {
  const { shift, alt, ctrl } = useMagicKeys();
  const nodeManager = useNodeManager();

  // 连接预览状态
  const connectionPreviewState = reactive<ConnectionPreviewState>({
    isConnecting: false,
    sourceNodeId: null,
    targetNodeId: null,
    isTargetValid: false,
    isGrafting: false,
  });

  /**
   * 核心预检函数，检查连接的有效性
   */
  function checkConnectionValidity(
    nodeIdToMove: string,
    newParentId: string
  ): boolean {
    const session = sessionRef();
    if (!session) return false;

    // 规则 1: 不能连接到自身
    if (nodeIdToMove === newParentId) return false;

    if (!session.nodes) return false;
    const nodeToMove = session.nodes[nodeIdToMove];
    const newParent = session.nodes[newParentId];
    if (!nodeToMove || !newParent) return false;

    // 规则 2: 不能操作预设消息节点
    if (nodeIdToMove.startsWith("preset-") || newParentId.startsWith("preset-"))
      return false;

    // 规则 3: 不能将节点移动到其自身的子孙节点下（防止循环依赖）
    const descendants = nodeManager.getAllDescendants(session, nodeIdToMove);
    if (descendants.some((d) => d.id === newParentId)) return false;

    // 规则 4: 不能移动根节点
    if (nodeIdToMove === session.rootNodeId) return false;

    // 规则 5: 如果目标父节点已经是当前父节点，则为无效操作
    if (nodeToMove.parentId === newParentId) return false;

    return true;
  }

  /**
   * 处理连接开始事件
   */
  function handleConnectionStart({
    nodeId,
  }: {
    event?: MouseEvent;
    nodeId?: string;
  }): void {
    if (!nodeId) return;

    const graftSubtreeModifier = settings.value.graphViewShortcuts.graftSubtree;
    const isGrafting =
      (graftSubtreeModifier === "shift" && shift.value) ||
      (graftSubtreeModifier === "alt" && alt.value) ||
      (graftSubtreeModifier === "ctrl" && ctrl.value);

    Object.assign(connectionPreviewState, {
      isConnecting: true,
      sourceNodeId: nodeId,
      targetNodeId: null,
      isTargetValid: false,
      isGrafting,
    });
    logger.debug("连接开始", { sourceNodeId: nodeId, isGrafting });
  }

  /**
   * 处理连接结束事件
   */
  function handleConnectionEnd(): void {
    Object.assign(connectionPreviewState, {
      isConnecting: false,
      sourceNodeId: null,
      targetNodeId: null,
      isTargetValid: false,
      isGrafting: false,
    });
    logger.debug("连接结束");
  }

  /**
   * 处理鼠标进入节点事件（连接时）
   */
  function handleNodeMouseEnter(nodeId: string): void {
    if (
      !connectionPreviewState.isConnecting ||
      !connectionPreviewState.sourceNodeId
    )
      return;

    const isValid = checkConnectionValidity(
      connectionPreviewState.sourceNodeId,
      nodeId
    );
    connectionPreviewState.targetNodeId = nodeId;
    connectionPreviewState.isTargetValid = isValid;
    logger.debug("连接时鼠标进入节点", { targetNodeId: nodeId, isValid });
  }

  /**
   * 处理鼠标离开节点事件（连接时）
   */
  function handleNodeMouseLeave(): void {
    if (!connectionPreviewState.isConnecting) return;

    connectionPreviewState.targetNodeId = null;
    connectionPreviewState.isTargetValid = false;
  }

  /**
   * 处理 Vue Flow 的连线事件，用作嫁接/移动交互
   */
  function handleEdgeConnect(connection: any): void {
    const session = sessionRef();
    if (!session) return;

    const sourceId = connection?.source as string | undefined;
    const targetId = connection?.target as string | undefined;
    if (!sourceId || !targetId) {
      logger.warn("连线操作失败：缺少有效的节点 ID", { connection });
      return;
    }

    const nodeIdToMove = targetId;
    const newParentId = sourceId;

    if (!checkConnectionValidity(nodeIdToMove, newParentId)) {
      logger.warn("无效的连接操作被阻止", { nodeIdToMove, newParentId });
      return;
    }

    const isGraftSubtree = connectionPreviewState.isGrafting;

    try {
      if (isGraftSubtree) {
        logger.info("执行子树嫁接", { nodeIdToMove, newParentId });
        store.graftBranch(nodeIdToMove, newParentId);
      } else {
        logger.info("执行单点移动", { nodeIdToMove, newParentId });
        store.moveNode(nodeIdToMove, newParentId);
      }
    } catch (error) {
      errorHandler.error(error, "连线操作失败", {
        context: { nodeIdToMove, newParentId, isGraftSubtree },
      });
    }
  }

  return {
    connectionPreviewState,
    checkConnectionValidity,
    handleConnectionStart,
    handleConnectionEnd,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleEdgeConnect,
  };
}
