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

import type { Ref } from "vue";
import { BranchNavigator } from "../../utils/BranchNavigator";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import type { ChatMessageNode } from "../../types/message";
import type { ModelIdentifier } from "../../types/llm";
import type { Asset } from "@/types/asset-management";
import type { KnowledgeReference } from "@/tools/knowledge-base/types";
import { createModuleLogger } from "@/utils/logger";
import type { createSessionAccessManager } from "./sessionAccessManager";
import type { createSessionRuntimeManager } from "./sessionRuntimeManager";
import type { createSessionHistoryManager } from "./sessionHistoryManager";

const logger = createModuleLogger("llm-chat/session-generation");

export interface SendMessageOptions {
  attachments?: Asset[];
  temporaryModel?: ModelIdentifier | null;
  knowledgeReference?: KnowledgeReference | null;
  parentId?: string;
  disableMacroParsing?: boolean;
  agentId?: string;
  sessionId?: string;
}

export interface GenerationOptions {
  modelId?: string;
  profileId?: string;
  agentId?: string;
  sessionId?: string;
}

interface GenerationState {
  sessionIndexMap: Ref<Map<string, ChatSessionIndex>>;
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
  abortControllers: Ref<Map<string, AbortController>>;
  generatingNodes: Ref<Set<string>>;
  queuedSessionIds: Ref<Set<string>>;
  queuedSessionAgentIds: Ref<Map<string, string>>;
}

function isQueuedMessageNode(node: ChatMessageNode): boolean {
  return (
    node.metadata?.isQueued === true ||
    node.status === "queued" ||
    (node.role === "assistant" && (node.status as string) === "pending")
  );
}

function hasQueuedMessageNodes(detail: ChatSessionDetail): boolean {
  return (
    !!detail.nodes && Object.values(detail.nodes).some(isQueuedMessageNode)
  );
}

interface GenerationManagers {
  access: ReturnType<typeof createSessionAccessManager>;
  runtime: ReturnType<typeof createSessionRuntimeManager>;
  history: ReturnType<typeof createSessionHistoryManager>;
  executeOrProxy: <T>(
    action: string,
    params: unknown,
    localFn: () => T | Promise<T>
  ) => Promise<T>;
  createChatHandler?: () => {
    sendMessage: (...args: any[]) => Promise<void>;
    continueGeneration: (...args: any[]) => Promise<void>;
    regenerateFromNode: (...args: any[]) => Promise<void>;
    completeInput: (...args: any[]) => Promise<string | null | undefined>;
  };
  createSessionManager?: () => {
    updateMessageCount: (...args: any[]) => void;
    updateSessionDisplayAgent: (...args: any[]) => void;
    persistSession: (...args: any[]) => void;
  };
}

export function createSessionGenerationManager(
  state: GenerationState,
  managers: GenerationManagers
) {
  // 正在被调度的排队节点。保留这个集合是为了让同一条排队链上的后续节点
  // 在前一个节点生成期间继续等待，同时允许不同分支的排队链并行启动。
  const processingQueuedNodeIds = new Set<string>();

  async function getChatHandler() {
    if (managers.createChatHandler) return managers.createChatHandler();
    const { useChatHandler } =
      await import("../../composables/chat/useChatHandler");
    return useChatHandler();
  }

  async function getSessionManager() {
    if (managers.createSessionManager) return managers.createSessionManager();
    const { useSessionManager } =
      await import("../../composables/session/useSessionManager");
    return useSessionManager();
  }

  async function persistGeneratedSession(
    index: ChatSessionIndex,
    detail: ChatSessionDetail
  ): Promise<void> {
    const sessionManager = await getSessionManager();
    sessionManager.updateMessageCount(
      index.id,
      detail.nodes,
      state.sessionIndexMap.value
    );
    sessionManager.updateSessionDisplayAgent(
      index.id,
      detail,
      state.sessionIndexMap.value
    );
    sessionManager.persistSession(index, detail, state.currentSessionId.value);
  }

  async function triggerQueuedGenerationForSession(
    sessionId: string
  ): Promise<void> {
    const index = state.sessionIndexMap.value.get(sessionId);
    const detail = state.sessionDetailMap.value.get(sessionId);
    if (!index || !detail || !detail.nodes) {
      state.queuedSessionIds.value.delete(sessionId);
      state.queuedSessionAgentIds.value.delete(sessionId);
      return;
    }

    const chatHandler = await getChatHandler();
    const sessionManager = await getSessionManager();

    const hasQueuedAncestor = (node: ChatMessageNode): boolean => {
      let parentId = node.parentId;
      while (parentId !== null) {
        if (
          processingQueuedNodeIds.has(parentId) ||
          (detail.nodes[parentId] &&
            isQueuedMessageNode(detail.nodes[parentId]))
        ) {
          return true;
        }
        parentId = detail.nodes[parentId]?.parentId ?? null;
      }
      return false;
    };

    // 只调度“当前路径已经空闲”的节点。会话中其它分支仍在生成时，
    // 不应阻塞本分支的排队任务；同一条排队链则由 queued ancestor 保证顺序。
    const readyQueuedNodes = Object.values(detail.nodes).filter(
      (node) =>
        isQueuedMessageNode(node) &&
        !processingQueuedNodeIds.has(node.id) &&
        !managers.runtime.isNodePathGenerating(sessionId, node.id) &&
        !hasQueuedAncestor(node)
    );

    if (readyQueuedNodes.length === 0) return;

    const triggerQueuedNode = async (
      queuedNode: ChatMessageNode
    ): Promise<void> => {
      processingQueuedNodeIds.add(queuedNode.id);

      // 先保留排队标记，直到本次恢复生成完成。这样并发 watcher 不会把
      // 正在由 continue/regenerate 接管的旧占位节点误判为僵死节点。
      detail.activeLeafId = queuedNode.id;

      const queuedAgentId =
        queuedNode.metadata?.agentId ||
        state.queuedSessionAgentIds.value.get(sessionId);

      try {
        if (queuedNode.role === "user") {
          queuedNode.status = "complete";
          logger.info("检测到排队中的 User 消息，自动触发合并回复", {
            sessionId,
            nodeId: queuedNode.id,
            agentId: queuedAgentId,
          });
          await chatHandler.regenerateFromNode(
            detail,
            queuedNode.id,
            [],
            state.abortControllers.value,
            state.generatingNodes.value,
            queuedAgentId ? { agentId: queuedAgentId } : undefined
          );
        } else {
          queuedNode.status = "waiting";
          const reuseQueuedNode = !queuedNode.content?.trim();
          logger.info("检测到排队中的 Assistant 占位节点，自动触发链式生成", {
            sessionId,
            nodeId: queuedNode.id,
            agentId: queuedAgentId,
            reuseQueuedNode,
          });
          await chatHandler.continueGeneration(
            detail,
            queuedNode.id,
            state.abortControllers.value,
            state.generatingNodes.value,
            {
              ...(queuedAgentId ? { agentId: queuedAgentId } : {}),
              ...(reuseQueuedNode ? { reuseNode: true } : {}),
            }
          );
        }

        sessionManager.updateMessageCount(
          index.id,
          detail.nodes,
          state.sessionIndexMap.value
        );
        sessionManager.updateSessionDisplayAgent(
          index.id,
          detail,
          state.sessionIndexMap.value
        );
        sessionManager.persistSession(
          index,
          detail,
          state.currentSessionId.value
        );
      } catch (error) {
        sessionManager.persistSession(
          index,
          detail,
          state.currentSessionId.value
        );
        throw error;
      } finally {
        if (queuedNode.metadata) {
          delete queuedNode.metadata.isQueued;
        }
        processingQueuedNodeIds.delete(queuedNode.id);
      }
    };

    // 不同分支的 ready 节点可以并行启动；同一条链的后续节点由于有 queued
    // ancestor，不会在本轮被选中，避免把串行链误发成并发请求。
    const results = await Promise.allSettled(
      readyQueuedNodes.map((node) => triggerQueuedNode(node))
    );

    if (
      !hasQueuedMessageNodes(detail) &&
      !Array.from(processingQueuedNodeIds).some((nodeId) =>
        detail.nodes[nodeId] ? true : false
      )
    ) {
      state.queuedSessionIds.value.delete(sessionId);
      state.queuedSessionAgentIds.value.delete(sessionId);
    }

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (rejected) throw rejected.reason;
  }

  async function sendMessage(
    content: string,
    options?: SendMessageOptions
  ): Promise<void> {
    return managers.executeOrProxy(
      "send-message",
      { content, options },
      async () => {
        const { sessionId, index, detail } =
          managers.access.resolveSessionContext(options?.sessionId);

        // 只在目标父节点所在的路径上已有生成任务时排队。
        // 同一会话切换到其它分支后，已有生成节点不属于新路径，应允许并行请求。
        const targetParentId =
          options?.parentId || detail.activeLeafId || detail.rootNodeId;
        const skipGeneration = managers.runtime.isNodePathGenerating(
          sessionId,
          targetParentId
        );
        if (skipGeneration) {
          state.queuedSessionIds.value.add(sessionId);
          if (options?.agentId)
            state.queuedSessionAgentIds.value.set(sessionId, options.agentId);
        }

        try {
          const chatHandler = await getChatHandler();
          const handlerOptions = skipGeneration
            ? { ...options, skipGeneration: true }
            : options;
          const sendPromise = chatHandler.sendMessage(
            detail,
            content,
            managers.access.getActivePath(sessionId),
            state.abortControllers.value,
            state.generatingNodes.value,
            handlerOptions,
            state.currentSessionId.value
          );

          try {
            const { useChatInputManager } =
              await import("../../composables/input/useChatInputManager");
            const inputManager = useChatInputManager();
            inputManager.clear(sessionId);
            logger.info("消息已进入发送流程，已清空目标会话输入框", {
              sessionId,
            });
          } catch (error) {
            logger.warn("反向驱动清空输入框失败", error);
          }

          await sendPromise;
          if (!skipGeneration && !hasQueuedMessageNodes(detail)) {
            state.queuedSessionIds.value.delete(sessionId);
            state.queuedSessionAgentIds.value.delete(sessionId);
          }

          await persistGeneratedSession(index, detail);
          managers.history.clearHistory(sessionId);
        } catch (error) {
          if (!hasQueuedMessageNodes(detail)) {
            state.queuedSessionIds.value.delete(sessionId);
            state.queuedSessionAgentIds.value.delete(sessionId);
          }
          const sessionManager = await getSessionManager();
          sessionManager.persistSession(
            index,
            detail,
            state.currentSessionId.value
          );
          throw error;
        }
      }
    );
  }

  async function continueGeneration(
    nodeId: string,
    options?: GenerationOptions
  ): Promise<void> {
    const sessionId = managers.access.resolveSessionIdForNode(
      nodeId,
      options?.sessionId
    );
    if (!sessionId) return;

    const { index, detail } = managers.access.resolveSessionContext(sessionId);
    try {
      const chatHandler = await getChatHandler();
      await chatHandler.continueGeneration(
        detail,
        nodeId,
        state.abortControllers.value,
        state.generatingNodes.value,
        options
      );
      await persistGeneratedSession(index, detail);
      managers.history.clearHistory(sessionId);
    } catch (error) {
      const sessionManager = await getSessionManager();
      sessionManager.persistSession(
        index,
        detail,
        state.currentSessionId.value
      );
      throw error;
    }
  }

  async function completeInput(
    content: string,
    options?: { modelId?: string; profileId?: string; sessionId?: string }
  ): Promise<void> {
    const sessionId = options?.sessionId || state.currentSessionId.value;
    if (!sessionId) return;

    const { detail } = managers.access.resolveSessionContext(sessionId);
    try {
      const chatHandler = await getChatHandler();
      const completion = await chatHandler.completeInput(
        content,
        detail,
        options
      );
      if (completion) {
        const { useChatInputManager } =
          await import("../../composables/input/useChatInputManager");
        const inputManager = useChatInputManager();
        inputManager.addContent(completion, "append", sessionId);
      }
    } catch (error) {
      logger.error("补全输入失败", error);
    }
  }

  async function regenerateFromNode(
    nodeId: string,
    options?: GenerationOptions
  ): Promise<void> {
    return managers.executeOrProxy(
      "regenerate-from-node",
      { nodeId, options },
      async () => {
        const sessionId = managers.access.resolveSessionIdForNode(
          nodeId,
          options?.sessionId
        );
        if (!sessionId) return;

        const { index, detail } =
          managers.access.resolveSessionContext(sessionId);
        try {
          const chatHandler = await getChatHandler();
          await chatHandler.regenerateFromNode(
            detail,
            nodeId,
            managers.access.getActivePath(sessionId),
            state.abortControllers.value,
            state.generatingNodes.value,
            options
          );
          await persistGeneratedSession(index, detail);
          managers.history.clearHistory(sessionId);
        } catch (error) {
          const sessionManager = await getSessionManager();
          sessionManager.persistSession(
            index,
            detail,
            state.currentSessionId.value
          );
          throw error;
        }
      }
    );
  }

  async function regenerateLastMessage(): Promise<void> {
    const { detail } = managers.access.resolveSessionContext();
    const { useBranchManager } =
      await import("../../composables/session/useBranchManager");
    const branchManager = useBranchManager();
    const result = branchManager.prepareRegenerateLastMessage(detail);

    if (
      !result.shouldRegenerate ||
      !result.userContent ||
      !result.newActiveLeafId
    ) {
      return;
    }

    detail.activeLeafId = result.newActiveLeafId;
    BranchNavigator.updateSelectionMemory(detail, result.newActiveLeafId);
    await sendMessage(result.userContent, { sessionId: detail.id });
  }

  return {
    sendMessage,
    continueGeneration,
    completeInput,
    regenerateFromNode,
    regenerateLastMessage,
    triggerQueuedGenerationForSession,
  };
}
