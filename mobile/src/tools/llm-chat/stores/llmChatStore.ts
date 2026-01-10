import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatSession, ChatMessageNode } from '../types';
import { useLlmProfilesStore } from '../../llm-api/stores/llmProfiles';
import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/store');

export const useLlmChatStore = defineStore('llmChat', () => {
  // ==================== 状态 ====================
  const sessions = ref<ChatSession[]>([]);
  const currentSessionId = ref<string | null>(null);
  const isSending = ref(false);
  const selectedModelValue = ref<string>(''); // 格式: profileId:modelId

  // ==================== Getters ====================
  const currentSession = computed(() => {
    if (!currentSessionId.value) return null;
    return sessions.value.find(s => s.id === currentSessionId.value) || null;
  });

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

    // 过滤掉 root 节点（如果有的话）
    return path.filter(node => node.id !== session.rootNodeId);
  });

  // ==================== Actions ====================

  /**
   * 创建新会话
   */
  function createSession(name: string = 'New Chat'): string {
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

    sessions.value.push(session);
    currentSessionId.value = sessionId;
    
    logger.info('Created new session', { sessionId, name });
    return sessionId;
  }

  /**
   * 切换会话
   */
  function switchSession(sessionId: string) {
    if (sessions.value.some(s => s.id === sessionId)) {
      currentSessionId.value = sessionId;
      logger.info('Switched to session', { sessionId });
    } else {
      logger.warn('Failed to switch session: not found', { sessionId });
    }
  }

  /**
   * 同步并校验当前选中的模型
   * 确保选中的模型所属的 Profile 是启用的，且模型确实存在
   */
  function syncSelectedModel() {
    const profilesStore = useLlmProfilesStore();
    const [profileId, modelId] = selectedModelValue.value.split(':');

    const isAvailable = (pId: string, mId: string) => {
      const profile = profilesStore.enabledProfiles.find(p => p.id === pId);
      return !!(profile && profile.models.some(m => m.id === mId));
    };

    if (!selectedModelValue.value || !isAvailable(profileId, modelId)) {
      // 尝试寻找第一个可用的模型
      const firstEnabledProfile = profilesStore.enabledProfiles[0];
      if (firstEnabledProfile && firstEnabledProfile.models.length > 0) {
        const newValue = `${firstEnabledProfile.id}:${firstEnabledProfile.models[0].id}`;
        selectedModelValue.value = newValue;
        logger.info('Selected model synced to first available', { newValue });
      } else {
        selectedModelValue.value = '';
        logger.warn('No enabled profiles or models available');
      }
    }
  }

  return {
    sessions,
    currentSessionId,
    isSending,
    selectedModelValue,
    currentSession,
    currentActivePath,
    createSession,
    switchSession,
    syncSelectedModel
  };
});