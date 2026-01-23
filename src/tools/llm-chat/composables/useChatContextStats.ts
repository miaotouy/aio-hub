/**
 * 上下文统计管理 Composable
 * 负责监听会话和智能体状态变化，并异步刷新上下文统计数据
 */

import { ref, watch, type Ref } from "vue";
import { debounce } from "lodash-es";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useAgentStore } from "../stores/agentStore";
import { useChatHandler } from "./useChatHandler";
import type { ChatSession } from "../types";
import type { ContextPreviewData } from "../types/context";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/useChatContextStats");

export function useChatContextStats(
  currentSession: Ref<ChatSession | null>,
  currentSessionId: Ref<string | null>
) {
  const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
  const isLoadingContextStats = ref(false);

  const refreshContextStats = async () => {
    const session = currentSession.value;
    if (!session || !session.activeLeafId) {
      contextStats.value = null;
      return;
    }

    const agentStore = useAgentStore();
    isLoadingContextStats.value = true;

    try {
      const { getLlmContextForPreview } = useChatHandler();

      const previewData = await getLlmContextForPreview(
        session,
        session.activeLeafId,
        agentStore.currentAgentId ?? undefined
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

  const debouncedRefreshContextStats = debounce(refreshContextStats, 500);

  // 监听核心状态变化
  watch(
    [
      currentSessionId,
      () => currentSession.value?.activeLeafId,
      () => currentSession.value?.updatedAt,
      () => {
        const chatStore = useLlmChatStore();
        return chatStore.isSending;
      },
      () => {
        const agentStore = useAgentStore();
        return agentStore.currentAgentId;
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
    ([, , , isSending]) => {
      // 1. 如果正在发送/生成中，跳过统计刷新，避免发送瞬间和流式回复过程中的卡顿
      // 统计应该在发送结束（isSending 变为 false）时，或者非发送状态下的内容变化时刷新
      if (isSending) {
        return;
      }

      // 2. 如果是从发送状态刚结束，或者内容发生变化，触发刷新
      debouncedRefreshContextStats();
    },
    { deep: true, immediate: true }
  );

  return {
    contextStats,
    isLoadingContextStats,
    refreshContextStats,
  };
}