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

import { reactive, shallowReactive, type Ref } from "vue";
import type {
  CompressionResult,
  ContextCompressionTaskView,
} from "../../types/contextCompression";
import { awaitWithSignal } from "../../utils/awaitWithSignal";
import type { ChatSessionDetail } from "../../types/session";
import type { ChatMessageNode } from "../../types/message";
import { completeAndDisposeStreamingMessageSource } from "../../composables/chat/useStreamingMessageSources";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/session-runtime");

function isQueuedMessageNode(node: ChatMessageNode): boolean {
  return (
    node.metadata?.isQueued === true ||
    node.status === "queued" ||
    (node.role === "assistant" && (node.status as string) === "pending")
  );
}

function markQueuedNodesAsStopped(detail: ChatSessionDetail): number {
  if (!detail.nodes) return 0;

  let count = 0;
  Object.values(detail.nodes).forEach((node) => {
    if (!isQueuedMessageNode(node)) return;

    node.status = "error";
    if (!node.metadata) node.metadata = {};
    delete node.metadata.isQueued;
    node.metadata.error = "队列已停止";
    count++;
  });

  return count;
}

interface RuntimeState {
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
  abortControllers: Ref<Map<string, AbortController>>;
  generatingNodes: Ref<Set<string>>;
  queuedSessionIds: Ref<Set<string>>;
  queuedSessionAgentIds: Ref<Map<string, string>>;
  findSessionIdByNodeId: (nodeId: string) => string | null;
}

export function createSessionRuntimeManager(state: RuntimeState) {
  const compressionTasks = shallowReactive(
    new Map<
      string,
      {
        controller: AbortController;
        promise: Promise<CompressionResult>;
        view: ContextCompressionTaskView;
      }
    >()
  );

  function getContextCompressionTask(
    sessionId: string
  ): ContextCompressionTaskView | null {
    const view = compressionTasks.get(sessionId)?.view;
    return view?.visible ? view : null;
  }

  function isSessionCompressing(sessionId: string): boolean {
    const view = compressionTasks.get(sessionId)?.view;
    return view?.visible === true && view.status === "running";
  }

  function cancelContextCompression(sessionId: string): void {
    compressionTasks.get(sessionId)?.controller.abort();
  }

  function runContextCompression(
    sessionId: string,
    operation: (
      signal: AbortSignal,
      showProgress: (messageCount: number) => void
    ) => Promise<CompressionResult>
  ): Promise<CompressionResult> {
    const existing = compressionTasks.get(sessionId);
    if (existing?.view.status === "running") return existing.promise;
    const controller = new AbortController();
    const view = reactive<ContextCompressionTaskView>({
      status: "running",
      messageCount: 0,
      visible: false,
    });
    const promise = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal, (messageCount) => {
          view.messageCount = messageCount;
          view.visible = true;
        });
      })
      .catch((error): CompressionResult => {
        if (!controller.signal.aborted)
          logger.warn("上下文压缩任务失败", error);
        return {
          success: false,
          failureReason: controller.signal.aborted
            ? "cancelled"
            : "request-failed",
        };
      })
      .then((result) => {
        if (compressionTasks.get(sessionId)?.promise !== promise) return result;
        if (
          result.success ||
          result.failureReason === "not-needed" ||
          !view.visible
        ) {
          compressionTasks.delete(sessionId);
        } else {
          view.status =
            result.failureReason === "cancelled" ? "cancelled" : "failed";
        }
        return result;
      });
    compressionTasks.set(sessionId, { controller, promise, view });
    return promise;
  }

  async function waitForContextCompression(
    sessionId: string,
    signal?: AbortSignal
  ): Promise<boolean> {
    signal?.throwIfAborted();
    const task = compressionTasks.get(sessionId);
    if (!task || task.view.status !== "running") return false;
    await awaitWithSignal(task.promise, signal);
    signal?.throwIfAborted();
    return true;
  }

  function isNodeGenerating(nodeId: string): boolean {
    return state.generatingNodes.value.has(nodeId);
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

  /**
   * 判断指定节点所在的消息路径上是否存在正在生成的节点。
   *
   * 会话内的不同分支可以并行生成，因此不能再用“会话中是否存在任意生成节点”
   * 作为排队条件。发送消息时应只阻塞与目标父节点处于同一路径的生成任务。
   */
  function isNodePathGenerating(
    sessionId: string,
    targetNodeId: string | null | undefined
  ): boolean {
    if (!targetNodeId) return false;

    const detail = state.sessionDetailMap.value.get(sessionId);
    if (!detail?.nodes) return false;

    let currentId: string | null = targetNodeId;
    while (currentId !== null) {
      if (state.generatingNodes.value.has(currentId)) return true;
      currentId = detail.nodes[currentId]?.parentId ?? null;
    }

    return false;
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
      const cancelledQueuedCount = detail
        ? markQueuedNodesAsStopped(detail)
        : 0;
      state.queuedSessionIds.value.delete(sessionId);
      state.queuedSessionAgentIds.value.delete(sessionId);
      if (cancelledQueuedCount > 0) {
        logger.info("已停止会话中的排队消息", {
          sessionId,
          count: cancelledQueuedCount,
        });
      }
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

    const cancelledQueuedCount = markQueuedNodesAsStopped(detail);
    state.queuedSessionIds.value.delete(targetSessionId);
    state.queuedSessionAgentIds.value.delete(targetSessionId);
    if (cancelledQueuedCount > 0) {
      logger.info("已停止会话中的排队消息", {
        sessionId: targetSessionId,
        count: cancelledQueuedCount,
      });
    }

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
    cancelContextCompression(sessionId);
    compressionTasks.delete(sessionId);
    const detail = state.sessionDetailMap.value.get(sessionId);
    if (detail?.nodes) {
      Object.keys(detail.nodes).forEach((nodeId) => {
        const controller = state.abortControllers.value.get(nodeId);
        controller?.abort();
        state.abortControllers.value.delete(nodeId);
        state.generatingNodes.value.delete(nodeId);
        completeAndDisposeStreamingMessageSource(nodeId);
      });
    }
    state.queuedSessionIds.value.delete(sessionId);
    state.queuedSessionAgentIds.value.delete(sessionId);
  }

  return {
    getContextCompressionTask,
    isSessionCompressing,
    cancelContextCompression,
    runContextCompression,
    waitForContextCompression,
    isNodeGenerating,
    getSessionGeneratingNodeIds,
    isSessionGenerating,
    isNodePathGenerating,
    abortNodeGeneration,
    abortSessionGeneration,
    clearSessionRuntime,
  };
}
