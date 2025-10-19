/**
 * 分离的 ChatArea Composable
 * 
 * 封装了 ChatArea 组件在独立窗口中运行时的所有逻辑，
 * 包括状态接收和操作代理。
 */
import { ref, computed, onUnmounted } from 'vue';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { createModuleLogger } from '@/utils/logger';
import type { ChatMessageNode, ChatSession, ChatAgent } from '../types';
import type { StateType } from '@/types/window-sync';

const logger = createModuleLogger('DetachedChatArea');

export function useDetachedChatArea() {
  const bus = useWindowSyncBus();

  // 1. 本地状态定义
  const messages = ref<ChatMessageNode[]>([]);
  const session = ref<ChatSession | null>(null);
  const agent = ref<ChatAgent | null>(null);
  const parameters = ref({
    isSending: false,
    disabled: true,
  });

  // 2. 状态接收引擎
  const { state: syncedMessages } = useStateSyncEngine(messages, {
    stateKey: 'chat-messages' as StateType,
    autoReceive: true,
  });

  useStateSyncEngine(session, {
    stateKey: 'chat-session' as StateType,
    autoReceive: true,
  });

  const { state: syncedAgent } = useStateSyncEngine(agent, {
    stateKey: 'chat-agent' as StateType,
    autoReceive: true,
  });

  const { state: syncedParameters } = useStateSyncEngine(parameters, {
    stateKey: 'chat-parameters' as StateType,
    autoReceive: true,
  });

  logger.info('分离的 ChatArea 同步引擎已初始化');

  // 3. 操作代理
  const sendMessage = (content: string) => {
    logger.info('代理发送消息操作', { content });
    return bus.requestAction('send-message', { content });
  };

  const abortSending = () => {
    logger.info('代理中止发送操作');
    return bus.requestAction('abort-sending', {});
  };

  const regenerateLastMessage = () => {
    logger.info('代理重新生成操作');
    return bus.requestAction('regenerate-last-message', {});
  };

  const deleteMessage = (messageId: string) => {
    logger.info('代理删除消息操作', { messageId });
    return bus.requestAction('delete-message', { messageId });
  };

  // 4. 导出的计算属性
  const currentAgentId = computed(() => syncedAgent.value?.id);
  const currentModelId = computed(() => syncedAgent.value?.modelId);

  onUnmounted(() => {
    logger.info('DetachedChatArea composable 已卸载');
  });

  return {
    // 状态
    messages: syncedMessages,
    isSending: computed(() => syncedParameters.value.isSending),
    disabled: computed(() => syncedParameters.value.disabled),
    currentAgentId,
    currentModelId,
    
    // 操作
    sendMessage,
    abortSending,
    deleteMessage,
    regenerateLastMessage,
  };
}