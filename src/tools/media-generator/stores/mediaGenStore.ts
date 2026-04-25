import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type {
  MediaTask,
  MediaTaskStatus,
  MediaTaskType,
  MediaMessage,
  GenerationSession,
  GenerationSessionDetail,
  MediaSessionIndexItem,
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
  const sessionIndexMap = ref<Map<string, MediaSessionIndexItem>>(new Map());
  const sessionDetailMap = ref<Map<string, GenerationSessionDetail>>(new Map());
  const nodes = ref<Record<string, MediaMessage>>({});
  const rootNodeId = ref("");
  const activeLeafId = ref("");
  const { tasks } = taskManager; // 使用全局任务池
  const generatingNodes = ref(new Set<string>()); // 正在生成的节点集合
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
  const sessions = computed(() => Array.from(sessionIndexMap.value.values()));

  const currentSession = computed((): MediaSessionIndexItem | null => {
    if (!currentSessionId.value) return null;
    return sessionIndexMap.value.get(currentSessionId.value) || null;
  });

  const currentSessionDetail = computed((): GenerationSessionDetail | null => {
    if (!currentSessionId.value) return null;
    return sessionDetailMap.value.get(currentSessionId.value) || null;
  });

  const currentFullSession = computed((): GenerationSession | null => {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) return null;
    return { ...index, ...detail };
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
    sessionIndexMap,
    sessionDetailMap,
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
    activeLeafId,
    updateSessionName: async (id, name) => {
      const index = sessionIndexMap.value.get(id);
      const detail = sessionDetailMap.value.get(id);
      if (index && detail) {
        index.name = name;
        index.updatedAt = new Date().toISOString();
        detail.updatedAt = index.updatedAt;
        await sessionManager.persistSession({ ...index, ...detail });
      }
    },
  });

  // --- Actions ---

  /**
   * 添加新任务
   */
  const addTask = (task: MediaTask) => {
    // 追踪生成状态
    generatingNodes.value.add(task.id);

    taskActionManager.addTaskNode(task, attachmentManager.attachments.value);

    // 显式更新时间
    if (currentSession.value && currentSessionDetail.value) {
      const now = new Date().toISOString();
      currentSession.value.updatedAt = now;
      currentSessionDetail.value.updatedAt = now;
    }

    // 自动命名逻辑
    const namingConfig = settings.value.topicNaming;
    const userMessageCount = messages.value.filter((m) => m.role === "user").length;

    if (
      settings.value.enableAutoNaming &&
      !aiLogic.isNaming.value &&
      currentSession.value &&
      currentSession.value.name.startsWith("新生成会话") &&
      namingConfig.modelCombo &&
      userMessageCount >= (namingConfig.autoTriggerThreshold || 1)
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
          generatingNodes.value.delete(taskId);
        } else if (status === "error") {
          node.status = "error";
          generatingNodes.value.delete(taskId);
        }
        nodes.value[taskId] = { ...node }; // 强制触发响应式
      }
    }
  };

  /**
   * 删除任务/消息
   */
  const removeTask = (taskId: string) => {
    const fullSession = currentFullSession.value;
    if (!fullSession) return;

    // 确保从生成追踪中移除
    generatingNodes.value.delete(taskId);

    taskManager.removeTask(taskId);
    const result = branchManager.deleteMessage(fullSession, taskId);
    if (result.success) {
      activeLeafId.value = fullSession.activeLeafId || "";
      // 显式更新时间
      const now = new Date().toISOString();
      if (currentSession.value) currentSession.value.updatedAt = now;
      if (currentSessionDetail.value) currentSessionDetail.value.updatedAt = now;
      persistence.persist();
    }
  };

  /**
   * 编辑消息
   */
  const editMessage = (messageId: string, content: string, attachments?: Asset[]) => {
    const fullSession = currentFullSession.value;
    if (!fullSession) return;
    const success = branchManager.editMessage(fullSession, messageId, content, attachments);
    if (success) {
      // 显式更新时间
      const now = new Date().toISOString();
      if (currentSession.value) currentSession.value.updatedAt = now;
      if (currentSessionDetail.value) currentSessionDetail.value.updatedAt = now;
      persistence.persist();
    }
  };

  // --- 状态自愈 Watcher ---
  // 姐姐，这个 Watch 负责监控“僵死节点”。
  // 如果任务池里的任务结束了，但节点还卡在 generating，我们会自动把它修好。
  watch(
    () => generatingNodes.value.size,
    (newSize, oldSize) => {
      if (newSize < (oldSize || 0)) {
        // 任务减少了，检查是否有漏网之鱼
        Object.values(nodes.value).forEach((node) => {
          if (node.status === "generating" && !generatingNodes.value.has(node.id)) {
            const task = taskManager.getTask(node.id);
            if (!task || task.status === "completed" || task.status === "error") {
              logger.warn("检测到僵死节点，正在自动修复状态", { nodeId: node.id });
              node.status = task?.status === "completed" ? "complete" : "error";
            }
          }
        });
      }
    },
    { flush: "post" }
  );

  /**
   * 切换会话
   */
  const switchSession = async (sessionId: string) => {
    if (sessionId === currentSessionId.value) return;
    // 切换会话时的持久化不应该更新时间
    await persistence.persist(false);

    const index = sessionIndexMap.value.get(sessionId);
    if (!index) return;

    // 按需加载详情
    let detail = sessionDetailMap.value.get(sessionId);
    if (!detail) {
      const { useMediaStorage } = await import("../composables/useMediaStorage");
      const storage = useMediaStorage();
      const loadedDetail = await storage.loadSessionDetail(sessionId);
      if (loadedDetail) {
        sessionDetailMap.value.set(sessionId, loadedDetail);
        detail = loadedDetail;
      }
    }

    if (detail) {
      currentSessionId.value = sessionId;
      nodes.value = detail.nodes || {};
      rootNodeId.value = detail.rootNodeId || "";
      activeLeafId.value = detail.activeLeafId || "";
      inputPrompt.value = detail.inputPrompt || "";
      if (detail.generationConfig) {
        currentConfig.value.activeType = detail.generationConfig.activeType || "image";
        if (detail.generationConfig.types) {
          currentConfig.value.types = {
            ...currentConfig.value.types,
            ...detail.generationConfig.types,
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
    const { index, detail } = sessionManager.createSessionObject(
      `新生成会话 ${sessionIndexMap.value.size + 1}`,
    );

    sessionIndexMap.value.set(index.id, index);
    sessionDetailMap.value.set(detail.id, detail);

    currentSessionId.value = index.id;
    nodes.value = detail.nodes;
    rootNodeId.value = detail.rootNodeId || "";
    activeLeafId.value = detail.activeLeafId || "";
    inputPrompt.value = "";
    currentConfig.value.activeType = "image";
    await sessionManager.persistSession({ ...index, ...detail });
  };

  /**
   * 更新会话名称
   */
  const updateSessionName = async (sessionId: string, name: string) => {
    const index = sessionIndexMap.value.get(sessionId);
    const detail = sessionDetailMap.value.get(sessionId);
    if (index) {
      index.name = name;
      index.updatedAt = new Date().toISOString();
      if (detail) {
        detail.updatedAt = index.updatedAt;
        await sessionManager.persistSession({ ...index, ...detail });
      } else {
        // 如果详情没加载，可能需要特殊的持久化逻辑，或者先加载详情
        // 这里简单处理：如果详情没加载，只更新索引（假设存储层支持）
        const { useMediaStorage } = await import("../composables/useMediaStorage");
        const storage = useMediaStorage();
        const fullSession = await storage.loadSession(sessionId);
        if (fullSession) {
          fullSession.name = name;
          fullSession.updatedAt = index.updatedAt;
          await sessionManager.persistSession(fullSession);
        }
      }
    }
  };

  /**
   * 删除会话
   */
  const deleteSession = async (sessionId: string) => {
    const success = await sessionManager.deleteSession(sessionId);
    if (!success) return;

    sessionIndexMap.value.delete(sessionId);
    sessionDetailMap.value.delete(sessionId);

    if (currentSessionId.value === sessionId) {
      if (sessionIndexMap.value.size > 0) {
        const firstId = Array.from(sessionIndexMap.value.keys())[0];
        await switchSession(firstId);
      } else {
        await createNewSession();
      }
    }
  };

  /**
   * 切换分支
   */
  const switchToBranch = (nodeId: string) => {
    const fullSession = currentFullSession.value;
    if (!fullSession) return;

    // 寻找目标分支的最深叶子节点，确保 activeLeafId 不落在中间节点（如 User 节点）上
    const deepestLeafId = nodeManager.findDeepestLeaf(fullSession, nodeId);

    const success = branchManager.switchBranch(fullSession, deepestLeafId);
    if (success) {
      activeLeafId.value = deepestLeafId;
      persistence.persist();
    }
  };

  return {
    // 状态
    sessions,
    sessionIndexMap,
    sessionDetailMap,
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
      const fullSession = currentFullSession.value;
      if (!fullSession) return;
      const newNodeId = branchManager.createBranch(fullSession, messageId);
      if (newNodeId) {
        // 如果是 User 节点另存，需要更新内容
        // 如果是 Assistant 节点另存（内部已转为 createRegenerateBranch），内容为空，无需 editMessage
        const node = nodes.value[newNodeId];
        if (node && node.role === "user") {
          branchManager.editMessage(fullSession, newNodeId, content, attachments);
        }

        activeLeafId.value = newNodeId;
        // 显式更新时间
        const now = new Date().toISOString();
        if (currentSession.value) currentSession.value.updatedAt = now;
        if (currentSessionDetail.value) currentSessionDetail.value.updatedAt = now;
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
      currentFullSession.value ? branchManager.getSiblings(currentFullSession.value, id) : [],
    isNodeInActivePath: (id: string) =>
      currentFullSession.value
        ? branchManager.isNodeInActivePath(currentFullSession.value, id)
        : false,

    // 节点操作
    toggleMessageEnabled: (id: string) => {
      if (!currentSessionId.value) return;
      const node = nodes.value[id];
      if (node) {
        node.isEnabled = !node.isEnabled;
        // 显式更新时间
        const now = new Date().toISOString();
        if (currentSession.value) currentSession.value.updatedAt = now;
        if (currentSessionDetail.value) currentSessionDetail.value.updatedAt = now;
        persistence.persist();
      }
    },
    updateNodeData: async (id: string, newData: Partial<MediaMessage>) => {
      if (!currentSessionId.value) return;
      const node = nodes.value[id];
      if (!node) return;
      const sanitizedData = { ...newData };
      delete (sanitizedData as any).id;
      delete (sanitizedData as any).parentId;
      delete (sanitizedData as any).childrenIds;
      const now = new Date().toISOString();
      nodes.value[id] = { ...node, ...sanitizedData, updatedAt: now };
      // 显式更新会话时间
      if (currentSession.value) currentSession.value.updatedAt = now;
      if (currentSessionDetail.value) currentSessionDetail.value.updatedAt = now;

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
    currentSessionDetail,
    currentFullSession,
    allTasks: tasks,

    // 重试逻辑
    getRetryParams(messageId: string) {
      // 纯读取：从节点中提取重试所需参数
      // 不修改 activeLeafId，不创建分支
      // addTaskNode 被调用时会根据当前 activeLeafId 自动判断挂载点
      return taskActionManager.getRetryParams(messageId);
    },
  };
});
