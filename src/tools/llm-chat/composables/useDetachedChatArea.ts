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
import { CHAT_STATE_KEYS } from '../types/sync';

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
    stateKey: CHAT_STATE_KEYS.MESSAGES,
    autoReceive: true,
    requestOnMount: true,
  });

  useStateSyncEngine(session, {
    stateKey: CHAT_STATE_KEYS.SESSION,
    autoReceive: true,
    requestOnMount: true,
  });

  const { state: syncedAgent } = useStateSyncEngine(agent, {
    stateKey: CHAT_STATE_KEYS.AGENT,
    autoReceive: true,
    requestOnMount: true,
  });

  const { state: syncedParameters } = useStateSyncEngine(parameters, {
    stateKey: CHAT_STATE_KEYS.PARAMETERS,
    autoReceive: true,
    requestOnMount: true,
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

  const regenerateLastMessage = (messageId: string) => {
    logger.info('代理重新生成操作', { messageId });
    return bus.requestAction('regenerate-from-node', { messageId });
  };

  const deleteMessage = (messageId: string) => {
    logger.info('代理删除消息操作', { messageId });
    return bus.requestAction('delete-message', { messageId });
  };

  const switchSibling = (nodeId: string, direction: 'prev' | 'next') => {
    logger.info('代理切换兄弟分支操作', { nodeId, direction });
    return bus.requestAction('switch-sibling', { nodeId, direction });
  };

  const toggleEnabled = (nodeId: string) => {
    logger.info('代理切换节点启用状态操作', { nodeId });
    return bus.requestAction('toggle-enabled', { nodeId });
  };

  const editMessage = (nodeId: string, newContent: string) => {
    logger.info('代理编辑消息操作', { nodeId, contentLength: newContent.length });
    return bus.requestAction('edit-message', { nodeId, newContent });
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
    switchSibling,
    toggleEnabled,
    editMessage,
  };
}