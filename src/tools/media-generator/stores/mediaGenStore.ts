import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  MediaTask,
  MediaTaskStatus,
  MediaTaskType,
  MediaMessage,
  GenerationSession,
  MediaGeneratorSettings,
} from "../types";
import { DEFAULT_MEDIA_GENERATOR_SETTINGS } from "../config";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import { useNodeManager } from "../composables/useNodeManager";
import { useBranchManager } from "../composables/useBranchManager";
import { useSessionManager } from "../composables/useSessionManager";
import { useAttachmentManager } from "../composables/useAttachmentManager";
import { useTaskActionManager } from "../composables/useTaskActionManager";
import { useMediaTaskManager } from "../composables/useMediaTaskManager";

// 逻辑拆分导入
import { useMediaGenAILogic } from "../composables/logic/useMediaGenAILogic";
import { useMediaGenBatchMode } from "../composables/logic/useMediaGenBatchMode";
import { useMediaGenPersistence } from "../composables/logic/useMediaGenPersistence";

const logger = createModuleLogger("media-generator/store");

export const useMediaGenStore = defineStore("media-generator", () => {
  const nodeManager = useNodeManager();
  const branchManager = useBranchManager();
  const sessionManager = useSessionManager();
  const attachmentManager = useAttachmentManager();
  const taskManager = useMediaTaskManager();

  // --- 核心状态 ---
  const sessions = ref<GenerationSession[]>([]);
  const nodes = ref<Record<string, MediaMessage>>({});
  const rootNodeId = ref("");
  const activeLeafId = ref("");
  const { tasks } = taskManager; // 使用全局任务池
  const activeTaskId = ref<string | null>(null);
  const currentSessionId = ref<string | null>(null);
  const inputPrompt = ref("");
  const settings = ref<MediaGeneratorSettings>({ ...DEFAULT_MEDIA_GENERATOR_SETTINGS });
  const currentConfig = ref({
    activeType: "image" as MediaTaskType,
    includeContext: false,
    types: {
      image: sessionManager.createDefaultTypeConfig(),
      video: sessionManager.createDefaultTypeConfig(),
      audio: sessionManager.createDefaultTypeConfig(),
    },
  });

  // --- 计算属性 ---
  const currentSession = computed(() => {
    if (!currentSessionId.value) return null;
    return sessions.value.find((s) => s.id === currentSessionId.value) || null;
  });

  const messages = computed(() => {
    if (!currentSessionId.value || !activeLeafId.value) return [];
    const tempSession = {
      id: currentSessionId.value,
      nodes: nodes.value,
      rootNodeId: rootNodeId.value,
      activeLeafId: activeLeafId.value,
    } as any;
    return nodeManager.getNodePath(tempSession, activeLeafId.value) as MediaMessage[];
  });

  // --- 业务逻辑管理封装 ---
  const taskActionManager = useTaskActionManager({
    nodes,
    tasks,
    activeLeafId,
    rootNodeId,
    currentConfig,
  });

  // --- 拆分逻辑集成 ---

  // 1. 持久化逻辑
  const persistence = useMediaGenPersistence({
    sessions,
    nodes,
    rootNodeId,
    activeLeafId,
    currentSessionId,
    inputPrompt,
    currentConfig,
    settings,
    tasks,
  });

  // 2. 批量模式逻辑
  const batchMode = useMediaGenBatchMode({ nodes, messages });

  // 3. AI 业务逻辑
  const aiLogic = useMediaGenAILogic({
    settings,
    nodes,
    updateSessionName: async (id, name) => {
      const session = sessions.value.find((s) => s.id === id);
      if (session) {
        session.name = name;
        session.updatedAt = new Date().toISOString();
        await sessionManager.persistSession(session);
      }
    },
  });

  // --- Actions ---

  /**
   * 添加新任务
   */
  const addTask = (task: MediaTask) => {
    taskActionManager.addTaskNode(task, attachmentManager.attachments.value);

    // 自动命名逻辑
    if (
      settings.value.enableAutoNaming &&
      !aiLogic.isNaming.value &&
      currentSession.value &&
      currentSession.value.name.startsWith("新生成会话") &&
      settings.value.topicNaming.modelCombo
    ) {
      setTimeout(() => {
        aiLogic
          .generateSessionName(currentSessionId.value!, currentSession.value!.name)
          .catch((err) => {
            logger.error("自动命名失败", err);
          });
      }, 1500);
    }

    attachmentManager.clearAttachments();
    persistence.persist();
  };

  /**
   * 更新任务状态
   */
  const updateTaskStatus = (
    taskId: string,
    status: MediaTaskStatus,
    updates?: Partial<MediaTask>
  ) => {
    taskManager.updateTaskStatus(taskId, status, updates);
    const task = taskManager.getTask(taskId);
    if (task) {
      const node = nodes.value[taskId];
      if (node) {
        if (node.metadata) {
          node.metadata.taskSnapshot = { ...task };
        }
        if (status === "completed") {
          node.status = "complete";
        } else if (status === "error") {
          node.status = "error";
        }
        nodes.value[taskId] = { ...node }; // 强制触发响应式
      }
    }
  };

  /**
   * 删除任务/消息
   */
  const removeTask = (taskId: string) => {
    if (!currentSession.value) return;
    taskManager.removeTask(taskId);
    const result = branchManager.deleteMessage(currentSession.value, taskId);
    if (result.success) {
      activeLeafId.value = currentSession.value.activeLeafId;
      persistence.persist();
    }
  };

  /**
   * 编辑消息
   */
  const editMessage = (messageId: string, content: string, attachments?: Asset[]) => {
    if (!currentSession.value) return;
    const success = branchManager.editMessage(
      currentSession.value,
      messageId,
      content,
      attachments
    );
    if (success) persistence.persist();
  };

  /**
   * 切换会话
   */
  const switchSession = async (sessionId: string) => {
    if (sessionId === currentSessionId.value) return;
    await persistence.persist();

    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      currentSessionId.value = session.id;
      nodes.value = session.nodes || {};
      rootNodeId.value = session.rootNodeId || "";
      activeLeafId.value = session.activeLeafId || "";
      inputPrompt.value = session.inputPrompt || "";
      if (session.generationConfig) {
        currentConfig.value.activeType = session.generationConfig.activeType || "image";
        if (session.generationConfig.types) {
          currentConfig.value.types = {
            ...currentConfig.value.types,
            ...session.generationConfig.types,
          };
        }
      }
      logger.info("已切换会话", { sessionId });
    }
  };

  /**
   * 创建新会话
   */
  const createNewSession = async () => {
    await persistence.persist();
    const session = sessionManager.createSessionObject(`新生成会话 ${sessions.value.length + 1}`);
    sessions.value.unshift(session);
    currentSessionId.value = session.id;
    nodes.value = session.nodes;
    rootNodeId.value = session.rootNodeId;
    activeLeafId.value = session.activeLeafId;
    inputPrompt.value = "";
    currentConfig.value.activeType = "image";
    await sessionManager.persistSession(session);
  };

  /**
   * 更新会话名称
   */
  const updateSessionName = async (sessionId: string, name: string) => {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      session.name = name;
      session.updatedAt = new Date().toISOString();
      await sessionManager.persistSession(session);
    }
  };

  /**
   * 删除会话
   */
  const deleteSession = async (sessionId: string) => {
    const success = await sessionManager.deleteSession(sessionId);
    if (!success) return;
    sessions.value = sessions.value.filter((s) => s.id !== sessionId);
    if (currentSessionId.value === sessionId) {
      if (sessions.value.length > 0) {
        await switchSession(sessions.value[0].id);
      } else {
        await createNewSession();
      }
    }
  };

  /**
   * 切换分支
   */
  const switchToBranch = (nodeId: string) => {
    if (!currentSession.value) return;
    const success = branchManager.switchBranch(currentSession.value, nodeId);
    if (success) {
      activeLeafId.value = nodeId;
      persistence.persist();
    }
  };

  return {
    // 状态
    sessions,
    messages,
    nodes,
    rootNodeId,
    activeLeafId,
    tasks,
    settings,
    activeTaskId,
    currentConfig,
    currentSessionId,
    isInitialized: persistence.isInitialized,
    inputPrompt,

    // 附件状态委托
    attachments: attachmentManager.attachments,
    isProcessingAttachments: attachmentManager.isProcessingAttachments,
    maxAttachmentCount: attachmentManager.maxAttachmentCount,
    attachmentCount: attachmentManager.attachmentCount,
    hasAttachments: attachmentManager.hasAttachments,
    isAttachmentsFull: attachmentManager.isAttachmentsFull,

    // 核心 Actions
    init: persistence.init,
    persist: persistence.persist,
    addTask,
    updateTaskStatus,
    getTask: taskManager.getTask,
    removeTask,
    deleteMessage: (id: string) => removeTask(id),
    editMessage,
    saveToBranch: (messageId: string, content: string, attachments?: Asset[]) => {
      if (!currentSession.value) return;
      const newNodeId = branchManager.createBranch(currentSession.value, messageId);
      if (newNodeId) {
        branchManager.editMessage(currentSession.value, newNodeId, content, attachments);
        activeLeafId.value = newNodeId;
        persistence.persist();
      }
    },

    // 批量模式 Actions
    isBatchMode: batchMode.isBatchMode,
    enterBatchMode: batchMode.enterBatchMode,
    exitBatchMode: batchMode.exitBatchMode,
    toggleMessageSelection: batchMode.toggleMessageSelection,
    selectedMessages: batchMode.selectedMessages,
    getSelectedContext: batchMode.selectedMessages,

    // 会话管理 Actions
    switchSession,
    createNewSession,
    deleteSession,
    updateSessionName,
    generateSessionName: aiLogic.generateSessionName,
    translatePrompt: aiLogic.translatePrompt,
    isNaming: aiLogic.isNaming,
    isTranslating: aiLogic.isTranslating,

    // 分支管理 Actions
    switchToBranch,
    getSiblings: (id: string) =>
      currentSession.value ? branchManager.getSiblings(currentSession.value, id) : [],
    isNodeInActivePath: (id: string) =>
      currentSession.value ? branchManager.isNodeInActivePath(currentSession.value, id) : false,

    // 节点操作
    toggleMessageEnabled: (id: string) => {
      if (!currentSession.value) return;
      const node = nodes.value[id];
      if (node) {
        node.isEnabled = !node.isEnabled;
        persistence.persist();
      }
    },
    updateNodeData: async (id: string, newData: Partial<MediaMessage>) => {
      if (!currentSession.value) return;
      const node = nodes.value[id];
      if (!node) return;
      const sanitizedData = { ...newData };
      delete (sanitizedData as any).id;
      delete (sanitizedData as any).parentId;
      delete (sanitizedData as any).childrenIds;
      nodes.value[id] = { ...node, ...sanitizedData, updatedAt: new Date().toISOString() };
      if (sanitizedData.metadata?.taskSnapshot && sanitizedData.metadata.taskId) {
        taskManager.updateTaskStatus(
          sanitizedData.metadata.taskId,
          sanitizedData.metadata.taskSnapshot.status,
          sanitizedData.metadata.taskSnapshot
        );
      }
      persistence.persist();
    },

    // 附件方法委托
    addAsset: attachmentManager.addAsset,
    removeAttachment: attachmentManager.removeAttachment,
    clearAttachments: attachmentManager.clearAttachments,
    currentSession,
    allTasks: tasks,

    // 重试逻辑
    getRetryParams(messageId: string, useNewBranch = false) {
      const node = nodes.value[messageId];
      if (!node) return null;
      if (useNewBranch && currentSession.value) {
        const baseNodeId =
          node.role === "assistant" && node.parentId ? node.parentId : node.parentId;
        if (baseNodeId) {
          const newNodeId = branchManager.createBranch(currentSession.value, baseNodeId);
          if (newNodeId) {
            activeLeafId.value = newNodeId;
            nodes.value[newNodeId].content = node.content;
            nodes.value[newNodeId].attachments = node.attachments ? [...node.attachments] : [];
            persistence.persist();
            return taskActionManager.getRetryParams(newNodeId);
          }
        }
      }
      if (node.role === "assistant" && node.parentId) {
        switchToBranch(node.parentId);
      } else {
        switchToBranch(node.id);
      }
      return taskActionManager.getRetryParams(messageId);
    },
  };
});
