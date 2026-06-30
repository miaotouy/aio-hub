import type { Ref } from "vue";
import type { ChatSessionDetail } from "../../types/session";
import { completeAndDisposeStreamingMessageSource } from "../../composables/chat/useStreamingMessageSources";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/session-runtime");

interface RuntimeState {
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
  abortControllers: Ref<Map<string, AbortController>>;
  generatingNodes: Ref<Set<string>>;
  queuedSessionIds: Ref<Set<string>>;
  queuedSessionAgentIds: Ref<Map<string, string>>;
  userAbortedNodeIds: Ref<Set<string>>;
  findSessionIdByNodeId: (nodeId: string) => string | null;
}

export function createSessionRuntimeManager(state: RuntimeState) {
  function isNodeGenerating(nodeId: string): boolean {
    return (
      state.generatingNodes.value.size >= 0 &&
      state.generatingNodes.value.has(nodeId)
    );
  }

  function getSessionGeneratingNodeIds(sessionId: string): string[] {
    const detail = state.sessionDetailMap.value.get(sessionId);
    if (!detail?.nodes || state.generatingNodes.value.size === 0) return [];

    return Object.values(detail.nodes)
      .filter((node) => state.generatingNodes.value.has(node.id))
      .map((node) => node.id);
  }

  function isSessionGenerating(sessionId: string): boolean {
    return getSessionGeneratingNodeIds(sessionId).length > 0;
  }

  function markNodeAsUserAborted(
    nodeId: string,
    detail?: ChatSessionDetail | null
  ): void {
    if (detail?.nodes?.[nodeId]) {
      const node = detail.nodes[nodeId];
      if (node.content?.trim()) {
        node.status = "complete";
      } else {
        node.status = "error";
        if (!node.metadata) node.metadata = {};
        node.metadata.error = "用户手动停止";
      }
      logger.info("已更新手动停止节点的状态", {
        nodeId,
        status: node.status,
        hasContent: !!node.content?.trim(),
      });
    }

    state.userAbortedNodeIds.value.add(nodeId);
    state.abortControllers.value.delete(nodeId);
    state.generatingNodes.value.delete(nodeId);
    completeAndDisposeStreamingMessageSource(nodeId);
  }

  function abortNodeGeneration(nodeId: string): void {
    const controller = state.abortControllers.value.get(nodeId);
    if (!controller) return;

    controller.abort();
    const sessionId = state.findSessionIdByNodeId(nodeId);
    const detail = sessionId
      ? state.sessionDetailMap.value.get(sessionId)
      : state.currentSessionId.value
        ? state.sessionDetailMap.value.get(state.currentSessionId.value)
        : null;

    if (sessionId) {
      state.queuedSessionIds.value.delete(sessionId);
      state.queuedSessionAgentIds.value.delete(sessionId);
    }

    markNodeAsUserAborted(nodeId, detail);
    logger.info("已中止节点生成", { nodeId, sessionId });
  }

  function abortSessionGeneration(sessionId?: string | null): void {
    const targetSessionId = sessionId || state.currentSessionId.value;
    if (!targetSessionId) return;

    const detail = state.sessionDetailMap.value.get(targetSessionId);
    if (!detail?.nodes) return;

    const nodeIds = getSessionGeneratingNodeIds(targetSessionId);
    if (nodeIds.length === 0) return;

    state.queuedSessionIds.value.delete(targetSessionId);
    state.queuedSessionAgentIds.value.delete(targetSessionId);

    nodeIds.forEach((nodeId) => {
      const controller = state.abortControllers.value.get(nodeId);
      controller?.abort();
      markNodeAsUserAborted(nodeId, detail);
      logger.info("已中止节点生成", { nodeId, sessionId: targetSessionId });
    });

    logger.info("已中止会话消息发送", {
      sessionId: targetSessionId,
      count: nodeIds.length,
    });
  }

  function clearSessionRuntime(sessionId: string): void {
    const detail = state.sessionDetailMap.value.get(sessionId);
    if (detail?.nodes) {
      Object.keys(detail.nodes).forEach((nodeId) => {
        const controller = state.abortControllers.value.get(nodeId);
        controller?.abort();
        state.abortControllers.value.delete(nodeId);
        state.generatingNodes.value.delete(nodeId);
        state.userAbortedNodeIds.value.delete(nodeId);
        completeAndDisposeStreamingMessageSource(nodeId);
      });
    }
    state.queuedSessionIds.value.delete(sessionId);
    state.queuedSessionAgentIds.value.delete(sessionId);
  }

  return {
    isNodeGenerating,
    getSessionGeneratingNodeIds,
    isSessionGenerating,
    abortNodeGeneration,
    abortSessionGeneration,
    clearSessionRuntime,
  };
}
