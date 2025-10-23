/**
 * 分离的 ChatArea Composable
 *
 * 封装了 ChatArea 组件在独立窗口中运行时的所有逻辑，
 * 包括完整状态接收和操作代理。
 *
 * 核心策略：
 * 1. 接收完整的 agents 和 sessions 列表
 * 2. 将这些数据直接填充到分离窗口的 Pinia Store
 * 3. 这样分离窗口就拥有和主窗口一样的完整上下文，可以独立工作
 */
import { ref, watch, computed, onUnmounted } from 'vue';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { createModuleLogger } from '@/utils/logger';
import type { ChatAgent, ChatSession } from '../types';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';

const logger = createModuleLogger('DetachedChatArea');

export function useDetachedChatArea() {
  const bus = useWindowSyncBus();
  const store = useLlmChatStore();
  const agentStore = useAgentStore();

  // 1. 创建本地 ref 用于接收同步数据
  const syncedAgents = ref<ChatAgent[]>([]);
  const syncedSessions = ref<ChatSession[]>([]);
  const syncedCurrentSessionId = ref<string | null>(null);
  const syncedParameters = ref({
    isSending: false,
    disabled: true,
  });

  // 2. 使用状态同步引擎接收完整状态（只接收，不推送）
  useStateSyncEngine(syncedAgents, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.AGENTS),
    autoPush: false,
  });

  useStateSyncEngine(syncedSessions, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.SESSIONS),
    autoPush: false,
  });

  useStateSyncEngine(syncedCurrentSessionId, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.CURRENT_SESSION_ID),
    autoPush: false,
  });

  useStateSyncEngine(syncedParameters, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.PARAMETERS),
    autoPush: false,
  });

  // 3. 监听同步数据的变化，并填充到 Pinia Store
  watch(syncedAgents, (newAgents) => {
    if (newAgents && newAgents.length > 0) {
      logger.info('接收到 agents 同步数据，更新到 Store', { count: newAgents.length });
      agentStore.agents = newAgents;
    }
  }, { deep: true });

  watch(syncedSessions, (newSessions) => {
    if (newSessions && newSessions.length > 0) {
      logger.info('接收到 sessions 同步数据，更新到 Store', { count: newSessions.length });
      store.sessions = newSessions;
    }
  }, { deep: true });

  watch(syncedCurrentSessionId, (newId) => {
    if (newId !== null) {
      logger.info('接收到 currentSessionId 同步数据，更新到 Store', { sessionId: newId });
      store.currentSessionId = newId;
    }
  });

  logger.info('分离的 ChatArea 同步引擎已初始化，将完整状态填充到 Store');

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

  const createBranch = (nodeId: string) => {
    logger.info('代理创建分支操作', { nodeId });
    return bus.requestAction('create-branch', { nodeId });
  };

  const abortNode = (nodeId: string) => {
    logger.info('代理中止节点生成操作', { nodeId });
    return bus.requestAction('abort-node', { nodeId });
  };

  // 4. 导出的计算属性和操作（现在可以直接从 Store 获取）
  const currentAgentId = computed(() => store.currentSession?.displayAgentId ?? undefined);
  const currentModelId = computed(() => {
    const agentId = store.currentSession?.displayAgentId;
    return agentId ? agentStore.getAgentById(agentId)?.modelId : undefined;
  });

  onUnmounted(() => {
    logger.info('DetachedChatArea composable 已卸载');
  });

  return {
    // 状态（从 Store 提供，因为现在 Store 已经有完整数据）
    messages: computed(() => store.currentActivePath),
    isSending: computed(() => syncedParameters.value.isSending),
    disabled: computed(() => syncedParameters.value.disabled),
    currentAgentId,
    currentModelId,
    
    // 操作代理
    sendMessage,
    abortSending,
    deleteMessage,
    regenerateLastMessage,
    switchSibling,
    toggleEnabled,
    editMessage,
    createBranch,
    abortNode,
  };
}