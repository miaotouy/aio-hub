import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatSession, ChatMessageNode } from '../types';
import { useLlmProfilesStore } from '../../llm-api/stores/llmProfiles';
import { useSessionManager, type SessionIndexItem } from '../composables/useSessionManager';
import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/store');

export const useLlmChatStore = defineStore('llmChat', () => {
  const sessionManager = useSessionManager();

  // ==================== 状态 ====================
  const sessionMetas = ref<SessionIndexItem[]>([]);
  const currentSessionId = ref<string | null>(null);
  const currentSessionDetail = ref<ChatSession | null>(null);
  const isSending = ref(false);
  const isLoaded = ref(false);
  const selectedModelValue = ref<string>(''); // 格式: profileId:modelId

  // ==================== Getters ====================
  const currentSession = computed(() => currentSessionDetail.value);

  /**
   * 获取当前会话的线性活跃路径（不含根节点）
   */
  const currentActivePath = computed((): ChatMessageNode[] => {
    const session = currentSession.value;
    if (!session) return [];

    const path: ChatMessageNode[] = [];
    let currentId: string | null = session.activeLeafId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) break;
      path.unshift(node);
      currentId = node.parentId;
    }

    // 过滤掉 root 节点
    return path.filter(node => node.id !== session.rootNodeId);
  });

  // ==================== Actions ====================

  /**
   * 初始化 Store
   */
  async function init() {
    if (isLoaded.value) return;

    const { sessionMetas: metas, currentSessionId: lastId } = await sessionManager.loadSessions();
    sessionMetas.value = metas;
    
    if (lastId) {
      await switchSession(lastId);
    }
    
    isLoaded.value = true;
    logger.info('Store initialized', { sessionCount: metas.length, lastId });
  }

  /**
   * 创建新会话
   */
  async function createSession(name: string = 'New Chat'): Promise<string> {
    const sessionId = uuidv4();
    const rootNodeId = uuidv4();
    
    const rootNode: ChatMessageNode = {
      id: rootNodeId,
      parentId: null,
      childrenIds: [],
      content: '',
      role: 'system',
      status: 'complete',
      timestamp: new Date().toISOString()
    };

    const session: ChatSession = {
      id: sessionId,
      name,
      nodes: {
        [rootNodeId]: rootNode
      },
      rootNodeId,
      activeLeafId: rootNodeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    currentSessionDetail.value = session;
    currentSessionId.value = sessionId;
    
    // 持久化
    await sessionManager.persistSession(session, sessionId);
    
    // 更新元数据列表
    const { sessionMetas: metas } = await sessionManager.loadSessions();
    sessionMetas.value = metas;

    logger.info('Created new session', { sessionId, name });
    return sessionId;
  }

  /**
   * 切换会话
   */
  async function switchSession(sessionId: string) {
    if (currentSessionId.value === sessionId && currentSessionDetail.value) return;

    const session = await sessionManager.loadSession(sessionId);
    if (session) {
      currentSessionDetail.value = session;
      currentSessionId.value = sessionId;
      await sessionManager.updateCurrentSessionId(sessionId);
      logger.info('Switched to session', { sessionId });
    } else {
      logger.warn('Failed to switch session: not found or load failed', { sessionId });
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string) {
    const newId = await sessionManager.deleteSession(sessionId);
    
    // 更新元数据
    const { sessionMetas: metas } = await sessionManager.loadSessions();
    sessionMetas.value = metas;

    if (newId) {
      await switchSession(newId);
    } else {
      currentSessionId.value = null;
      currentSessionDetail.value = null;
    }
    
    logger.info('Deleted session', { sessionId, nextId: newId });
  }

  /**
   * 持久化当前会话
   */
  async function persistCurrentSession() {
    if (currentSessionDetail.value) {
      await sessionManager.persistSession(currentSessionDetail.value, currentSessionId.value);
    }
  }

  /**
   * 同步并校验当前选中的模型
   */
  function syncSelectedModel() {
    const profilesStore = useLlmProfilesStore();
    const [profileId, modelId] = selectedModelValue.value.split(':');

    const isAvailable = (pId: string, mId: string) => {
      const profile = profilesStore.enabledProfiles.find(p => p.id === pId);
      return !!(profile && profile.models.some(m => m.id === mId));
    };

    if (!selectedModelValue.value || !isAvailable(profileId, modelId)) {
      const firstEnabledProfile = profilesStore.enabledProfiles[0];
      if (firstEnabledProfile && firstEnabledProfile.models.length > 0) {
        const newValue = `${firstEnabledProfile.id}:${firstEnabledProfile.models[0].id}`;
        selectedModelValue.value = newValue;
      } else {
        selectedModelValue.value = '';
      }
    }
  }

  return {
    // 状态
    sessionMetas,
    currentSessionId,
    isSending,
    isLoaded,
    selectedModelValue,
    
    // Getters
    currentSession,
    currentActivePath,
    
    // Actions
    init,
    createSession,
    switchSession,
    deleteSession,
    persistCurrentSession,
    syncSelectedModel
  };
});