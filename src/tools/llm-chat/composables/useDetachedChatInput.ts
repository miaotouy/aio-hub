/**
 * 分离的 MessageInput Composable
 *
 * 封装了 MessageInput 组件在独立窗口中运行时的所有逻辑，
 * 主要包括状态消费和操作代理。
 */
import { ref, computed, watch } from 'vue';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { createModuleLogger } from '@/utils/logger';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';
import { useChatSettings } from './useChatSettings';

const logger = createModuleLogger('DetachedChatInput');

export function useDetachedChatInput() {
  const bus = useWindowSyncBus();

  // 1. 创建本地 ref 用于接收 isSending 状态
  const isSending = ref(false);

  // 2. 使用状态同步引擎接收 isSending 状态
  // 注意:这里用一个包装对象来同步，因为引擎目前不支持直接同步顶层 ref
  const syncState = ref({ isSending: false, disabled: false });
  useStateSyncEngine(syncState, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.PARAMETERS),
    autoPush: false, // 只接收
  });
  watch(syncState, (newState) => {
    isSending.value = newState.isSending;
  }, { deep: true, immediate: true });

  // 3. 消费聊天设置（包含流式输出开关）
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
  const handleSendMessage = (content: string) => {
    logger.info('代理发送消息操作', { content });
    bus.requestAction('send-message', { content });
  };

  const handleAbort = () => {
    logger.info('代理中止发送操作');
    bus.requestAction('abort-sending', {});
  };

  // 5. 返回 props 和事件监听器（与 useDetachedChatArea 保持一致的结构）
  return {
    props: computed(() => ({
      isDetached: true,
      // disabled 状态由主窗口同步过来
      disabled: syncState.value.disabled,
      isSending: isSending.value,
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