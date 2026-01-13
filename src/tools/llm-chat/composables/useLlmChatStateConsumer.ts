/**
 * LLM Chat 状态消费者 Composable
 *
 * 封装了在分离的组件窗口 (detached-component) 中消费状态的逻辑。
 * 它负责从上游窗口（主窗口或分离的工具窗口）接收完整状态，并填充到当前窗口的 Pinia Store 中。
 *
 * 注意：分离的工具窗口 (detached-tool) 现在作为独立数据源运行，不再使用此 Consumer。
 * 此 Consumer 主要用于像 ChatArea 这样被单独分离出去的子组件。
 *
 * 核心原则：
 * - 只接收状态，不推送状态（autoPush: false）
 * - 不处理业务逻辑，所有操作都代理回上游窗口
 */
import { ref, watch } from 'vue';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useLlmChatStore } from '../stores/llmChatStore';
import { useAgentStore } from '../stores/agentStore';
import { useUserProfileStore } from '../stores/userProfileStore';
import { useWorldbookStore } from '../stores/worldbookStore';
import { useLlmChatUiState } from './useLlmChatUiState';
import { createModuleLogger } from '@/utils/logger';
import type { ChatAgent, ChatSession, UserProfile } from '../types';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';

const logger = createModuleLogger('LlmChatStateConsumer');

interface ConsumerOptions {
  /**
   * 是否同步所有会话
   * - true: 同步完整的 sessions 列表（适用于完整工具窗口）
   * - false: 只同步当前激活的会话（适用于分离的 ChatArea，性能更好）
   * @default true
   */
  syncAllSessions?: boolean;
}

export function useLlmChatStateConsumer(options: ConsumerOptions = {}) {
  const { syncAllSessions = true } = options;
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const worldbookStore = useWorldbookStore();
  const bus = useWindowSyncBus();

  logger.info('初始化 LLM Chat 状态消费者', { syncAllSessions });

  // 1. 创建本地 ref 用于接收所有需要同步的数据
  const syncedAgents = ref<ChatAgent[]>([]);
  const syncedCurrentAgentId = ref<string | null>(null);
  const syncedSessions = ref<ChatSession[]>([]);
  const syncedCurrentSessionData = ref<ChatSession | null>(null);
  const syncedCurrentSessionId = ref<string | null>(null);
  const syncedUserProfiles = ref<UserProfile[]>([]);
  const syncedGlobalProfileId = ref<string | null>(null);
  const syncedWorldbooks = ref<any[]>([]);
  const syncedIsSending = ref(false);
  const syncedGeneratingNodes = ref<string[]>([]);
  // const syncedParameters = ref({ isSending: false, disabled: true }); // 已废弃，使用独立的 IS_SENDING 和推导的 disabled

  // 2. 为每个状态实例化一个只接收的同步引擎
  const engines = [
    { state: syncedAgents, key: CHAT_STATE_KEYS.AGENTS },
    { state: syncedCurrentAgentId, key: CHAT_STATE_KEYS.CURRENT_AGENT_ID },
    // 根据 syncAllSessions 决定订阅哪个状态
    ...(syncAllSessions
      ? [{ state: syncedSessions, key: CHAT_STATE_KEYS.SESSIONS }]
      : [{ state: syncedCurrentSessionData, key: CHAT_STATE_KEYS.CURRENT_SESSION_DATA }]
    ),
    { state: syncedCurrentSessionId, key: CHAT_STATE_KEYS.CURRENT_SESSION_ID },
    { state: syncedUserProfiles, key: CHAT_STATE_KEYS.USER_PROFILES },
    { state: syncedGlobalProfileId, key: CHAT_STATE_KEYS.GLOBAL_PROFILE_ID },
    { state: syncedWorldbooks, key: CHAT_STATE_KEYS.WORLDBOOK_INDEX },
    { state: syncedIsSending, key: CHAT_STATE_KEYS.IS_SENDING }, // 关键修复：同步 isSending 状态
    { state: syncedGeneratingNodes, key: CHAT_STATE_KEYS.GENERATING_NODES }, // 关键修复：同步 generatingNodes 状态
    // { state: syncedParameters, key: CHAT_STATE_KEYS.PARAMETERS }, // 已废弃
    // 设置也需要同步，因为它影响UI（例如流式开关）
    { state: ref({}), key: CHAT_STATE_KEYS.SETTINGS },
  ];

  for (const { state, key } of engines) {
    useStateSyncEngine(state, {
      ...createChatSyncConfig(key),
      autoPush: false,
      requestOnMount: false, // 所有状态由一次总请求触发
    });
  }

  // 3. 一次性请求所有初始状态
  bus.requestInitialState();

  // 4. 监听同步数据的变化，并填充到对应的 Pinia Store
  watch(syncedAgents, (newAgents) => {
    if (newAgents && newAgents.length > 0) {
      logger.info('接收到 agents 同步数据', { count: newAgents.length });
      agentStore.agents = newAgents;
    }
  }, { deep: true });

  watch(syncedCurrentAgentId, (newId) => {
    if (newId) {
      logger.info('接收到 currentAgentId 同步数据', { agentId: newId });
      // 正确的做法：更新 useLlmChatUiState 提供的 ref
      const { currentAgentId: uiCurrentAgentId } = useLlmChatUiState();
      uiCurrentAgentId.value = newId;
    }
  });

  // 全量会话同步（完整模式）
  if (syncAllSessions) {
    watch(syncedSessions, (newSessions) => {
      if (newSessions && newSessions.length > 0) {
        logger.info('接收到 sessions 同步数据（完整模式）', { count: newSessions.length });
        store.sessions = newSessions;
      }
    }, { deep: true });
  } else {
    // 轻量级同步：只接收当前会话
    watch(syncedCurrentSessionData, (newSessionData) => {
      if (newSessionData) {
        logger.info('接收到 currentSessionData 同步数据（轻量级模式）', {
          sessionId: newSessionData.id,
          messageCount: Object.keys(newSessionData.nodes).length
        });
        
        // 查找是否已存在该会话
        const existingIndex = store.sessions.findIndex((s: ChatSession) => s.id === newSessionData.id);
        
        if (existingIndex >= 0) {
          // 更新现有会话
          store.sessions[existingIndex] = newSessionData;
        } else {
          // 添加新会话
          store.sessions.push(newSessionData);
        }
      }
    }, { deep: true });
  }

  watch(syncedCurrentSessionId, (newId) => {
    if (newId) {
      logger.info('接收到 currentSessionId 同步数据', { sessionId: newId });
      store.currentSessionId = newId;
    }
  });

  watch(syncedUserProfiles, (newProfiles) => {
    if (newProfiles && newProfiles.length > 0) {
      logger.info('接收到 userProfiles 同步数据', { count: newProfiles.length });
      userProfileStore.profiles = newProfiles;
    }
  }, { deep: true });

  watch(syncedGlobalProfileId, (newId) => {
    logger.info('接收到 globalProfileId 同步数据', { profileId: newId });
    userProfileStore.globalProfileId = newId;
  });

  watch(syncedWorldbooks, (newWbs) => {
    if (newWbs) {
      logger.info('接收到 worldbooks 同步数据', { count: newWbs.length });
      worldbookStore.worldbooks = newWbs;
    }
  }, { deep: true });

  watch(syncedIsSending, (newValue) => {
    // logger.info('接收到 isSending 同步数据', { isSending: newValue });
    store.isSending = newValue;
  });

  watch(syncedGeneratingNodes, (newNodes) => {
    if (newNodes) {
      // logger.info('接收到 generatingNodes 同步数据', { count: newNodes.length });
      store.generatingNodes = new Set(newNodes);
    }
  });

  logger.info('LLM Chat 状态消费者已初始化，将与上游窗口完全同步');

  return {};
}