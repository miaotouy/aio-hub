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
import type { ModelIdentifier } from "../../types/llm";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@/utils/logger";
import type { createSessionAccessManager } from "./sessionAccessManager";
import type { createSessionRuntimeManager } from "./sessionRuntimeManager";
import type { createSessionHistoryManager } from "./sessionHistoryManager";

const logger = createModuleLogger("llm-chat/session-generation");

export interface SendMessageOptions {
  attachments?: Asset[];
  temporaryModel?: ModelIdentifier | null;
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

    if (managers.runtime.isSessionGenerating(sessionId)) return;

    const { useChatSettings } =
      await import("../../composables/settings/useChatSettings");
    const { settings } = useChatSettings();
    const queueMode = settings.value.uiPreferences.queueReplyMode ?? "combined";
    const chatHandler = await getChatHandler();
    const sessionManager = await getSessionManager();

    try {
      if (queueMode === "combined") {
        const activeLeaf = detail.activeLeafId
          ? detail.nodes[detail.activeLeafId]
          : null;
        if (
          !activeLeaf ||
          activeLeaf.role !== "user" ||
          (activeLeaf.childrenIds && activeLeaf.childrenIds.length > 0)
        ) {
          state.queuedSessionIds.value.delete(sessionId);
          return;
        }

        state.queuedSessionIds.value.delete(sessionId);
        const queuedAgentId = state.queuedSessionAgentIds.value.get(sessionId);
        state.queuedSessionAgentIds.value.delete(sessionId);
        logger.info("检测到排队中的 User 消息，自动触发合并回复", {
          sessionId,
          nodeId: activeLeaf.id,
          agentId: queuedAgentId,
        });
        await chatHandler.regenerateFromNode(
          detail,
          activeLeaf.id,
          [],
          state.abortControllers.value,
          state.generatingNodes.value,
          queuedAgentId ? { agentId: queuedAgentId } : undefined
        );
      } else {
        const pendingAssistant = Object.values(detail.nodes).find(
          (node) =>
            node.role === "assistant" && (node.status as string) === "pending"
        );
        if (!pendingAssistant) {
          state.queuedSessionIds.value.delete(sessionId);
          return;
        }

        state.queuedSessionIds.value.delete(sessionId);
        const queuedAgentId =
          state.queuedSessionAgentIds.value.get(sessionId) ||
          pendingAssistant.metadata?.agentId;
        state.queuedSessionAgentIds.value.delete(sessionId);
        logger.info("检测到排队中的 Assistant 占位节点，自动触发链式生成", {
          sessionId,
          nodeId: pendingAssistant.id,
          agentId: queuedAgentId,
        });
        await chatHandler.continueGeneration(
          detail,
          pendingAssistant.id,
          state.abortControllers.value,
          state.generatingNodes.value,
          queuedAgentId ? { agentId: queuedAgentId } : undefined
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
    }
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
        const skipGeneration = managers.runtime.isSessionGenerating(sessionId);
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
          if (!skipGeneration) {
            state.queuedSessionIds.value.delete(sessionId);
            state.queuedSessionAgentIds.value.delete(sessionId);
          }

          await persistGeneratedSession(index, detail);
          managers.history.clearHistory(sessionId);
        } catch (error) {
          state.queuedSessionIds.value.delete(sessionId);
          state.queuedSessionAgentIds.value.delete(sessionId);
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
