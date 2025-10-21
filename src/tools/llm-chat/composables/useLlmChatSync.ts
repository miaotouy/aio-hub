/**
 * LLM Chat 状态同步 Composable
 * 
 * 封装了 LlmChat.vue 与分离窗口之间的所有状态同步和操作代理逻辑
 */
import { computed, type Ref } from 'vue';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { createModuleLogger } from '@/utils/logger';
import type { LlmChatStateKey } from '../types/sync';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';

const logger = createModuleLogger('LlmChatSync');

export function useLlmChatSync() {
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const bus = useWindowSyncBus();

  // 1. 状态定义
  const chatMessages = computed(() => store.currentActivePath);
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
  const stateEngines: Array<{ manualPush: (isFullSync?: boolean, targetWindowLabel?: string) => Promise<void> }> = [];

  const createStateEngine = <T>(stateSource: Ref<T>, stateKey: LlmChatStateKey) => {
    const engine = useStateSyncEngine(stateSource, createChatSyncConfig(stateKey));
    stateEngines.push(engine);
  };

  createStateEngine(chatMessages, CHAT_STATE_KEYS.MESSAGES);
  createStateEngine(chatSession, CHAT_STATE_KEYS.SESSION);
  createStateEngine(chatAgent, CHAT_STATE_KEYS.AGENT);
  createStateEngine(chatParameters, CHAT_STATE_KEYS.PARAMETERS);

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
      case 'regenerate-from-node':
        return store.regenerateFromNode(params.messageId);
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

    // 4. 监听初始状态请求，按需推送全量状态
    bus.onInitialStateRequest((requesterLabel) => {
      logger.info(`收到来自 ${requesterLabel} 的初始状态请求，开始推送...`);
      for (const engine of stateEngines) {
        // 定向、强制推送全量状态给请求者
        engine.manualPush(true, requesterLabel);
      }
      logger.info(`已向 ${requesterLabel} 推送所有初始状态`);
    });

    // 5. 监听重连事件，广播全量状态
    bus.onReconnect(() => {
      logger.info('主窗口重新获得焦点，向所有子窗口广播最新状态...');
      for (const engine of stateEngines) {
        engine.manualPush(true); // 广播全量状态
      }
    });
  }

  return {};
}