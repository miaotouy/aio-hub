import { defineStore } from 'pinia';
import { ref, watch, computed } from 'vue';
import type { MediaTask, MediaTaskStatus, MediaTaskType, GenerationSession, MediaGeneratorSettings } from '../types';
import { DEFAULT_MEDIA_GENERATOR_SETTINGS } from '../config';
import { createModuleLogger } from '@/utils/logger';
import { useMediaStorage } from '../composables/useMediaStorage';
import { v4 as uuidv4 } from 'uuid';
import type { Asset } from '@/types/asset-management';

const logger = createModuleLogger('media-generator/store');

export const useMediaGenStore = defineStore('media-generator', () => {
  const storage = useMediaStorage();
  const debouncedSave = storage.createDebouncedSave(2000);

  const sessions = ref<GenerationSession[]>([]);
  const tasks = ref<MediaTask[]>([]);
  const activeTaskId = ref<string | null>(null);
  const currentSessionId = ref<string | null>(null);
  const isInitialized = ref(false);

  // 附件管理
  const attachments = ref<Asset[]>([]);
  const isProcessingAttachments = ref(false);
  const maxAttachmentCount = 5;
  const attachmentCount = computed(() => attachments.value.length);
  const hasAttachments = computed(() => attachments.value.length > 0);
  const isAttachmentsFull = computed(() => attachments.value.length >= maxAttachmentCount);

  // 全局设置
  const settings = ref<MediaGeneratorSettings>({ ...DEFAULT_MEDIA_GENERATOR_SETTINGS });

  // 默认参数模板
  const createDefaultTypeConfig = () => ({
    modelCombo: '',
    params: {
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      negativePrompt: "",
      seed: -1,
      steps: 20,
      cfgScale: 7.0,
      background: "opaque",
      inputFidelity: "low",
    }
  });

  // 当前生成配置
  const currentConfig = ref({
    activeType: 'image' as MediaTaskType,
    types: {
      image: createDefaultTypeConfig(),
      video: createDefaultTypeConfig(),
      audio: createDefaultTypeConfig(),
    }
  });

  /**
   * 初始化 Store
   */
  const init = async () => {
    if (isInitialized.value) return;

    try {
      // 加载全局设置
      const loadedSettings = await storage.loadSettings();
      settings.value = { ...DEFAULT_MEDIA_GENERATOR_SETTINGS, ...loadedSettings };

      const { sessions: loadedSessions, currentSessionId: savedSessionId } = await storage.loadSessions();
      sessions.value = loadedSessions;

      let session: GenerationSession | null = null;

      if (savedSessionId) {
        session = loadedSessions.find(s => s.id === savedSessionId) || null;
      }

      // 如果没有保存的会话，创建一个默认的
      if (!session) {
        if (loadedSessions.length > 0) {
          session = loadedSessions[0];
        } else {
          const newId = uuidv4();
          session = {
            id: newId,
            name: '默认生成会话',
            type: 'media-gen',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tasks: [],
            generationConfig: {
              activeType: 'image',
              types: {
                image: createDefaultTypeConfig(),
                video: createDefaultTypeConfig(),
                audio: createDefaultTypeConfig(),
              }
            },
            nodes: {}, // 兼容 ChatSession
            rootNodeId: '',
            activeLeafId: ''
          };
          sessions.value = [session];
          await storage.persistSession(session, newId);
        }
      }

      // 应用加载的数据
      currentSessionId.value = session.id;
      tasks.value = session.tasks || [];
      if (session.generationConfig) {
        currentConfig.value.activeType = session.generationConfig.activeType || 'image';
        if (session.generationConfig.types) {
          currentConfig.value.types = {
            ...currentConfig.value.types,
            ...session.generationConfig.types
          };
        }
      }

      isInitialized.value = true;
      logger.info('Store 初始化完成', { sessionId: session.id, taskCount: tasks.value.length });
    } catch (error) {
      logger.error('Store 初始化失败', error);
    }
  };

  /**
   * 持久化当前状态
   */
  const persist = async () => {
    if (!currentSessionId.value) return;

    const currentSession = sessions.value.find(s => s.id === currentSessionId.value);

    const session: GenerationSession = {
      id: currentSessionId.value,
      name: currentSession?.name || '默认生成会话',
      type: 'media-gen',
      updatedAt: new Date().toISOString(),
      createdAt: currentSession?.createdAt || new Date().toISOString(),
      tasks: tasks.value,
      generationConfig: {
        activeType: currentConfig.value.activeType,
        types: JSON.parse(JSON.stringify(currentConfig.value.types))
      },
      nodes: {},
      rootNodeId: '',
      activeLeafId: ''
    };

    // 更新 sessions 列表中的元数据
    const index = sessions.value.findIndex(s => s.id === session.id);
    if (index !== -1) {
      sessions.value[index] = session;
    } else {
      sessions.value.push(session);
    }

    await storage.persistSession(session, currentSessionId.value);
  };

  // 监听配置变化自动保存
  watch(currentConfig, () => {
    if (!isInitialized.value || !currentSessionId.value) return;

    const currentSession = sessions.value.find(s => s.id === currentSessionId.value);
    const session: GenerationSession = {
      id: currentSessionId.value,
      name: currentSession?.name || '默认生成会话',
      type: 'media-gen',
      updatedAt: new Date().toISOString(),
      createdAt: currentSession?.createdAt || new Date().toISOString(),
      tasks: tasks.value,
      generationConfig: {
        activeType: currentConfig.value.activeType,
        types: JSON.parse(JSON.stringify(currentConfig.value.types))
      },
      nodes: {},
      rootNodeId: '',
      activeLeafId: ''
    };

    debouncedSave(session, currentSessionId.value);
  }, { deep: true });

  // 监听全局设置变化自动保存
  watch(settings, (newSettings) => {
    if (!isInitialized.value) return;
    storage.saveSettings(newSettings);
    logger.debug('全局设置已保存');
  }, { deep: true });

  /**
   * 添加新任务
   */
  const addTask = (task: MediaTask) => {
    tasks.value.unshift(task);
    logger.info('任务已添加', { taskId: task.id, type: task.type });
    persist();
  };

  /**
   * 更新任务状态
   */
  const updateTaskStatus = (taskId: string, status: MediaTaskStatus, updates?: Partial<MediaTask>) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (updates) {
        Object.assign(task, updates);
      }
      if (status === 'completed') {
        task.completedAt = Date.now();
      }
      logger.debug('任务状态已更新', { taskId, status });
      persist();
    }
  };

  /**
   * 获取任务
   */
  const getTask = (taskId: string) => {
    return tasks.value.find(t => t.id === taskId);
  };

  /**
   * 删除任务
   */
  const removeTask = (taskId: string) => {
    const index = tasks.value.findIndex(t => t.id === taskId);
    if (index !== -1) {
      tasks.value.splice(index, 1);
      logger.info('任务已删除', { taskId });
      persist();
    }
  };

  /**
   * 切换会话
   */
  const switchSession = async (sessionId: string) => {
    if (sessionId === currentSessionId.value) return;

    // 先保存当前会话
    await persist();

    const session = sessions.value.find(s => s.id === sessionId);
    if (session) {
      currentSessionId.value = session.id;
      tasks.value = session.tasks || [];
      if (session.generationConfig) {
        currentConfig.value.activeType = session.generationConfig.activeType || 'image';
        if (session.generationConfig.types) {
          currentConfig.value.types = {
            ...currentConfig.value.types,
            ...session.generationConfig.types
          };
        }
      }
      logger.info('已切换会话', { sessionId });
    }
  };

  /**
   * 创建新会话
   */
  const createNewSession = async () => {
    // 先保存当前会话
    await persist();

    const newId = uuidv4();
    const session: GenerationSession = {
      id: newId,
      name: `新生成会话 ${sessions.value.length + 1}`,
      type: 'media-gen',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: [],
      generationConfig: {
        activeType: 'image',
        types: {
          image: createDefaultTypeConfig(),
          video: createDefaultTypeConfig(),
          audio: createDefaultTypeConfig(),
        }
      },
      nodes: {},
      rootNodeId: '',
      activeLeafId: ''
    };

    sessions.value.unshift(session);
    currentSessionId.value = newId;
    tasks.value = [];
    currentConfig.value.activeType = 'image';

    await storage.persistSession(session, newId);
    logger.info('已创建新会话', { sessionId: newId });
  };

  /**
   * 删除会话
   */
  const deleteSession = async (sessionId: string) => {
    await storage.deleteSession(sessionId);
    sessions.value = sessions.value.filter(s => s.id !== sessionId);

    if (currentSessionId.value === sessionId) {
      if (sessions.value.length > 0) {
        await switchSession(sessions.value[0].id);
      } else {
        await createNewSession();
      }
    }
    logger.info('已删除会话', { sessionId });
  };

  /**
   * 更新会话名称
   */
  const updateSessionName = async (sessionId: string, name: string) => {
    const session = sessions.value.find(s => s.id === sessionId);
    if (session) {
      session.name = name;
      if (sessionId === currentSessionId.value) {
        await persist();
      } else {
        await storage.saveSession(session);
      }
    }
  };

  /**
   * 附件操作
   */
  const addAsset = (asset: Asset) => {
    if (isAttachmentsFull.value) return false;
    if (attachments.value.some(a => a.id === asset.id)) return false;
    attachments.value.push(asset);
    return true;
  };

  const removeAttachment = (assetId: string) => {
    attachments.value = attachments.value.filter(a => a.id !== assetId);
  };

  const clearAttachments = () => {
    attachments.value = [];
  };

  return {
    sessions,
    tasks,
    settings,
    activeTaskId,
    currentConfig,
    currentSessionId,
    isInitialized,
    attachments,
    isProcessingAttachments,
    maxAttachmentCount,
    attachmentCount,
    hasAttachments,
    isAttachmentsFull,
    init,
    persist,
    addTask,
    updateTaskStatus,
    getTask,
    removeTask,
    switchSession,
    createNewSession,
    deleteSession,
    updateSessionName,
    addAsset,
    removeAttachment,
    clearAttachments
  };
});