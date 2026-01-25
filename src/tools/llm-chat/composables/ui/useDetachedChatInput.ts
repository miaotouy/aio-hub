/**
 * 分离的 MessageInput Composable
 *
 * 封装了 MessageInput 组件在独立窗口中运行时的所有逻辑，
 * 主要包括状态消费和操作代理。
 */
import { computed } from 'vue';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { createModuleLogger } from '@/utils/logger';
import { useChatSettings } from "../settings/useChatSettings";
import { useLlmChatStore } from "../../stores/llmChatStore";

const logger = createModuleLogger('DetachedChatInput');

export function useDetachedChatInput() {
  const bus = useWindowSyncBus();
  const store = useLlmChatStore();

  // 1. 消费聊天设置（包含流式输出开关）
  // 这个设置已经在 useLlmChatSync 中被同步了，这里只需要消费
  const { settings, isLoaded: settingsLoaded } = useChatSettings();

  // 计算流式输出状态
  const isStreamingEnabled = computed(() => {
    return settingsLoaded.value ? settings.value.uiPreferences.isStreaming : false;
  });

  logger.info('分离的 MessageInput 同步引擎已初始化', {
    isStreamingEnabled: isStreamingEnabled.value,
    settingsLoaded: settingsLoaded.value
  });

  // 4. 操作代理
  const handleSendMessage = (content: string, attachments?: any[]) => {
    logger.info('代理发送消息操作', { content, attachmentCount: attachments?.length });
    bus.requestAction('send-message', { content, attachments });
  };

  const handleAbort = () => {
    logger.info('代理中止发送操作');
    bus.requestAction('abort-sending', {});
  };

  // 5. 返回 props 和事件监听器（与 useDetachedChatArea 保持一致的结构）
  return {
    props: computed(() => ({
      isDetached: true,
      // 如果没有当前会话，则禁用输入框
      disabled: !store.currentSession,
      isSending: store.isSending,
      // 注意：不需要在这里传递 isStreamingEnabled
      // MessageInput 组件内部会通过 useChatSettings() 自己读取
      // 但为了调试，我们在日志中输出当前值
    })),
    listeners: {
      send: handleSendMessage,
      abort: handleAbort,
    },
  };
}