/**
 * 上下文统计管理 Composable
 * 负责监听会话和智能体状态变化，并异步刷新上下文统计数据
 */

import { ref, watch, type Ref } from "vue";
import { debounce } from "lodash-es";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useChatHandler } from "../chat/useChatHandler";
import { useChatInputManager } from "../input/useChatInputManager";
import type { ChatSession } from "../../types";
import type { ContextPreviewData } from "../../types/context";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/useChatContextStats");

export function useChatContextStats(currentSession: Ref<ChatSession | null>, currentSessionId: Ref<string | null>) {
  const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
  const isLoadingContextStats = ref(false);

  const refreshContextStats = async () => {
    const session = currentSession.value;
    if (!session || !session.activeLeafId) {
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
        session,
        session.activeLeafId,
        agentStore.currentAgentId ?? undefined,
        {
          pendingInput: {
            // 仅传递临时模型以确保统计口径正确。
            // 不传递 text 字段，这样预览引擎就不会在结果中包含“待发送消息”的虚拟节点，
            // 从而实现纯粹的“历史上下文统计”，避免与输入框自身的 Token 计数重叠。
            temporaryModel,
          },
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
    ([, , , isSending], [, , , oldIsSending]) => {
      // 1. 如果正在发送/生成中，跳过统计刷新，避免发送瞬间和流式回复过程中的卡顿
      // 统计应该在发送结束（isSending 变为 false）时，或者非发送状态下的内容变化时刷新
      if (isSending) {
        return;
      }

      // 2. 如果是从发送状态刚结束（isSending 从 true 变为 false），立即刷新，不要防抖
      // 这样可以确保在发送完毕后第一时间更新 Token 统计，且此时状态是最新的
      if (oldIsSending === true && isSending === false) {
        refreshContextStats();
        return;
      }

      // 3. 其他非发送状态下的内容变化，使用防抖刷新
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
