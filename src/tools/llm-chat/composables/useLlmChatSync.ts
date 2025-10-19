/**
 * LLM Chat 状态同步 Composable
 * 
 * 封装了 LlmChat.vue 与分离窗口之间的所有状态同步和操作代理逻辑
 */
import { computed } from 'vue';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { createModuleLogger } from '@/utils/logger';
import type { StateType } from '@/types/window-sync';

const logger = createModuleLogger('LlmChatSync');

export function useLlmChatSync() {
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const bus = useWindowSyncBus();

  // 1. 状态定义
  const chatMessages = computed(() => store.currentMessageChain);
  const chatSession = computed(() => store.currentSession);
  const chatAgent = computed(() => {
    const agentId = store.currentSession?.currentAgentId;
    return agentId ? agentStore.getAgentById(agentId) : null;
  });
  const chatParameters = computed(() => {
    return {
      isSending: store.isSending,
      disabled: !store.currentSession,
    };
  });

  // 2. 状态同步引擎实例化
  useStateSyncEngine(chatMessages, {
    stateKey: 'chat-messages' as StateType,
    autoPush: true,
  });

  useStateSyncEngine(chatSession, {
    stateKey: 'chat-session' as StateType,
    autoPush: true,
  });

  useStateSyncEngine(chatAgent, {
    stateKey: 'chat-agent' as StateType,
    autoPush: true,
  });

  useStateSyncEngine(chatParameters, {
    stateKey: 'chat-parameters' as StateType,
    autoPush: true,
  });

  logger.info('LLM Chat 同步引擎已初始化');

  // 3. 操作代理：监听并处理来自子窗口的请求
  const handleActionRequest = (action: string, params: any): Promise<any> => {
    logger.info('收到操作请求', { action, params });
    switch (action) {
      case 'send-message':
        return store.sendMessage(params.content);
      case 'abort-sending':
        store.abortSending();
        return Promise.resolve();
      case 'regenerate-last-message':
        return store.regenerateLastMessage();
      case 'delete-message':
        store.deleteMessage(params.messageId);
        return Promise.resolve();
      default:
        logger.warn('未知的操作请求', { action });
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  };

  // 仅在主窗口注册操作处理器
  if (bus.windowType === 'main') {
    bus.onActionRequest(handleActionRequest);
    logger.info('已注册操作请求处理器');
  }

  // 4. 监听连接事件，为新连接的窗口推送一次全量状态
  // (StateSyncEngine 内部应该处理这个，但这里可以加一个保险)
  bus.onConnect((windowLabel, windowInfo) => {
    logger.info('新窗口已连接，准备推送初始状态', { windowLabel, windowInfo });
    // TODO: 触发一次全量推送
  });

  return {};
}