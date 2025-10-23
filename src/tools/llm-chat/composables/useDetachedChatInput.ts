/**
 * 分离的 MessageInput Composable
 *
 * 封装了 MessageInput 组件在独立窗口中运行时的所有逻辑，
 * 主要包括状态消费和操作代理。
 */
import { ref, computed } from 'vue';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { createModuleLogger } from '@/utils/logger';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';

const logger = createModuleLogger('DetachedChatInput');

export function useDetachedChatInput() {
  const bus = useWindowSyncBus();

  // 1. 创建本地 ref 用于接收同步数据
  // MessageInput 只需要知道是否正在发送和是否禁用
  const syncedParameters = ref({
    isSending: false,
    disabled: true,
  });

  // 2. 使用状态同步引擎接收参数状态
  useStateSyncEngine(syncedParameters, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.PARAMETERS),
    autoPush: false, // 只接收，不推送
  });

  logger.info('分离的 MessageInput 同步引擎已初始化');

  // 3. 操作代理
  const handleSendMessage = (content: string) => {
    logger.info('代理发送消息操作', { content });
    bus.requestAction('send-message', { content });
  };

  const handleAbort = () => {
    logger.info('代理中止发送操作');
    bus.requestAction('abort-sending', {});
  };

  // 4. 返回 props 和事件监听器（与 useDetachedChatArea 保持一致的结构）
  return {
    props: computed(() => ({
      isDetached: true,
      disabled: syncedParameters.value.disabled,
      isSending: syncedParameters.value.isSending,
    })),
    listeners: {
      send: handleSendMessage,
      abort: handleAbort,
    },
  };
}