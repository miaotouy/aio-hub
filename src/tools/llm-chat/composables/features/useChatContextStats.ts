/**
 * 上下文统计管理 Composable
 * 负责监听会话和智能体状态变化，并异步刷新上下文统计数据
 */

import { ref, watch, type Ref } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useChatHandler } from "../chat/useChatHandler";
import { useChatInputManager } from "../input/useChatInputManager";
import type { ChatSessionIndex, ChatSessionDetail } from "../../types/session";
import type { ContextPreviewData } from "../../types/context";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/useChatContextStats");

export function useChatContextStats(
  currentSessionIndex: Ref<ChatSessionIndex | null>,
  currentSessionDetail: Ref<ChatSessionDetail | null>,
  currentSessionId: Ref<string | null>
) {
  const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
  const isLoadingContextStats = ref(false);

  const refreshContextStats = async (reason = "manual") => {
    // 强制等待一个微任务，确保 Vue 响应式数据和 Store 状态已经同步
    await new Promise((resolve) => setTimeout(resolve, 0));

    const index = currentSessionIndex.value;
    const detail = currentSessionDetail.value;
    logger.debug(`[ContextStats] 准备刷新统计, 原因: ${reason}`, {
      sessionId: index?.id,
      activeLeafId: detail?.activeLeafId,
      updatedAt: index?.updatedAt,
    });

    if (!index || !detail || !detail.activeLeafId) {
      contextStats.value = null;
      return;
    }

    const agentStore = useAgentStore();
    const inputManager = useChatInputManager();
    isLoadingContextStats.value = true;

    try {
      const { getLlmContextForPreview } = useChatHandler();

      // 考虑临时模型覆盖
      const temporaryModel = inputManager.temporaryModel.value;

      const previewData = await getLlmContextForPreview(
        detail,
        detail.activeLeafId,
        agentStore.currentAgentId ?? undefined,
        {
          pendingInput: temporaryModel ? {
            text: "", // 不传递实际文本，仅用于传递模型信息
            temporaryModel,
          } : undefined
        }
      );

      if (previewData) {
        contextStats.value = previewData.statistics;
      }
    } catch (error) {
      logger.warn("获取上下文统计失败", error);
    } finally {
      isLoadingContextStats.value = false;
    }
  };

  const debouncedRefreshContextStats = useDebounceFn(refreshContextStats, 500);

  // 监听核心状态变化
  watch(
    [
      currentSessionId,
      () => currentSessionDetail.value?.activeLeafId,
      () => currentSessionIndex.value?.updatedAt,
      () => {
        const chatStore = useLlmChatStore();
        return chatStore.isSending;
      },
      () => {
        const agentStore = useAgentStore();
        return agentStore.currentAgentId;
      },
      () => {
        const inputManager = useChatInputManager();
        // 监听临时模型的变化，确保统计口径同步
        return JSON.stringify(inputManager.temporaryModel.value);
      },
      () => {
        const agentStore = useAgentStore();
        if (!agentStore.currentAgentId) return null;
        const agent = agentStore.getAgentById(agentStore.currentAgentId);

        // 仅监听影响上下文计算的核心配置
        return JSON.stringify({
          modelId: agent?.modelId,
          contextManagement: agent?.parameters?.contextManagement,
          contextPostProcessing: agent?.parameters?.contextPostProcessing,
          presets: agent?.presetMessages,
        });
      },
    ],
    (newValues, oldValues) => {
      const [newSessionId, newLeafId, newUpdatedAt, isSending] = newValues;
      const [oldSessionId, oldLeafId, oldUpdatedAt, oldIsSending] = oldValues || [];

      logger.debug(`[ContextStats] Watch 触发`, {
        isSending,
        oldIsSending,
        newLeafId,
        oldLeafId,
        newUpdatedAt,
        newUpdatedAtChanged: newUpdatedAt !== oldUpdatedAt,
        newSessionId,
      });

      // 1. 如果正在发送/生成中
      if (isSending) {
        // 特殊情况：如果是 activeLeafId 变了（说明新消息上屏了，或者切换了分支）
        // 这种情况下即使正在发送（刚开始发送），也应该触发一次刷新，以包含最新的用户消息
        if (newLeafId !== oldLeafId || newSessionId !== oldSessionId) {
          logger.debug(`[ContextStats] 发送期间检测到 LeafId 变化，触发防抖刷新`);
          debouncedRefreshContextStats();
          return;
        }

        // 其他情况（如流式输出导致的 updatedAt 变化），在发送期间跳过刷新，避免卡顿
        return;
      }

      // 2. 如果是从发送状态刚结束（isSending 从 true 变为 false），立即刷新，不要防抖
      // 这样可以确保在发送完毕后第一时间更新 Token 统计，且此时状态是最新的
      if (oldIsSending === true && isSending === false) {
        logger.debug(`[ContextStats] 检测到发送结束，立即刷新`);
        refreshContextStats("send_end");
        return;
      }

      // 3. 其他非发送状态下的内容变化，使用防抖刷新
      logger.debug(`[ContextStats] 非发送状态变化，防抖刷新`);
      debouncedRefreshContextStats();
    },
    { deep: true, immediate: true },
  );

  return {
    contextStats,
    isLoadingContextStats,
    refreshContextStats,
  };
}
