/**
 * LLM Chat 状态消费者 Composable
 *
 * 封装了在分离的工具窗口 (detached-tool) 中消费状态的逻辑。
 * 它负责从上游窗口（通常是主窗口）接收完整状态，并填充到当前窗口的 Pinia Store 中。
 *
 * 这确保了 detached-tool 窗口能成为 main 窗口的精确副本，从而可以独立显示 UI，
 * 同时也能向它自己分离出的子组件 (detached-component) 提供状态。
 *
 * 核心原则：
 * - 只接收状态，不推送状态（autoPush: false）
 * - 不处理业务逻辑，所有操作都代理回主窗口
 * - 作为主窗口和深层子组件之间的"中继站"
 */
import { ref, watch } from 'vue';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { createModuleLogger } from '@/utils/logger';
import type { ChatAgent, ChatSession } from '../types';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';

const logger = createModuleLogger('LlmChatStateConsumer');

export function useLlmChatStateConsumer() {
  const store = useLlmChatStore();
  const agentStore = useAgentStore();

  logger.info('初始化 LLM Chat 状态消费者');

  // 1. 创建本地 ref 用于接收同步数据
  const syncedAgents = ref<ChatAgent[]>([]);
  const syncedSessions = ref<ChatSession[]>([]);
  const syncedCurrentSessionId = ref<string | null>(null);

  // 2. 使用状态同步引擎接收完整状态（只接收，不推送）
  useStateSyncEngine(syncedAgents, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.AGENTS),
    autoPush: false, // 关键：不推送，只接收
  });

  useStateSyncEngine(syncedSessions, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.SESSIONS),
    autoPush: false,
  });

  useStateSyncEngine(syncedCurrentSessionId, {
    ...createChatSyncConfig(CHAT_STATE_KEYS.CURRENT_SESSION_ID),
    autoPush: false,
  });

  // 参数状态也接收，但不需要填充到 Store（因为它是衍生状态）
  useStateSyncEngine(ref({ isSending: false, disabled: true }), {
    ...createChatSyncConfig(CHAT_STATE_KEYS.PARAMETERS),
    autoPush: false,
  });

  // 3. 监听同步数据的变化，并填充到 Pinia Store
  // 这样当前窗口就拥有了和主窗口一样的完整数据
  watch(
    syncedAgents,
    (newAgents) => {
      if (newAgents && newAgents.length > 0) {
        logger.info('接收到 agents 同步数据，更新到 Store', { count: newAgents.length });
        agentStore.agents = newAgents;
      }
    },
    { deep: true }
  );

  watch(
    syncedSessions,
    (newSessions) => {
      if (newSessions && newSessions.length > 0) {
        logger.info('接收到 sessions 同步数据，更新到 Store', { count: newSessions.length });
        store.sessions = newSessions;
      }
    },
    { deep: true }
  );

  watch(syncedCurrentSessionId, (newId) => {
    if (newId !== null) {
      logger.info('接收到 currentSessionId 同步数据，更新到 Store', { sessionId: newId });
      store.currentSessionId = newId;
    }
  });

  logger.info('LLM Chat 状态消费者已初始化，Store 将与上游窗口同步');

  return {};
}