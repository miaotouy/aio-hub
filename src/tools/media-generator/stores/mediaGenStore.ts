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
  const settings = ref<MediaGeneratorSettings>({
    ...DEFAULT_MEDIA_GENERATOR_SETTINGS,
  });
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
    return nodeManager.getNodePath(
      tempSession,
      activeLeafId.value
    ) as MediaMessage[];
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
        // 重新 set 以触发 Map 的响应式更新
        sessionIndexMap.value.set(id, { ...index });
        if (detail) sessionDetailMap.value.set(id, { ...detail });

        await sessionManager.persistSession({ ...index, ...detail });
      }
    },
  });

  // --- Actions ---

  /**
   * 会话模式下提交任务
   * 职责：编排任务构造、翻译、节点创建、执行启动
   */
  const submitTaskInSession = async (options: any, type: MediaTaskType) => {
    const { useMediaGenerationManager } =
      await import("../composables/useMediaGenerationManager");
    const genManager = useMediaGenerationManager();

    // 1. 翻译逻辑
    let translatedPrompt: string | undefined;
    if (settings.value.translation.enabled && options.prompt) {
      translatedPrompt = await aiLogic.translatePrompt(options.prompt);
    }

    // 2. 构造任务
    const task = genManager.buildTask(options, type, translatedPrompt);

    // 3. 注册到任务池
    taskManager.addTask(task);

    // 4. 追踪生成状态
    generatingNodes.value.add(task.id);

    // 5. 在会话树中创建节点
    taskActionManager.addTaskNode(task, attachmentManager.attachments.value);

    // 6. 如果有译文，更新节点元数据
    if (translatedPrompt) {
      const node = nodes.value[task.id];
      if (node && node.metadata) {
        node.metadata.translatedContent = translatedPrompt;
      }
    }

    // 7. 自动命名逻辑
    const namingConfig = settings.value.topicNaming;
    const userMessageCount = messages.value.filter(
      (m) => m.role === "user"
    ).length;

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
          .generateSessionName(
            currentSessionId.value!,
            currentSession.value!.name
          )
          .catch((err) => {
            logger.error("自动命名失败", err);
          });
      }, 1500);
    }

    // 8. 清理输入状态
    attachmentManager.clearAttachments();
    persistence.persist(true);

    // 9. 启动执行
    const config = {
      timeout: settings.value.requestSettings?.timeout,
      maxRetries: settings.value.requestSettings?.maxRetries,
      autoIncludeLastResult: settings.value.autoIncludeLastResult,
    };

    await genManager.executeGeneration(task, messages.value, config);
  };

  /**
   * 添加新任务 (仅用于节点追踪，不再负责创建节点)
   * @deprecated 推荐使用 submitTaskInSession 或直接操作 TaskManager
   */
  const addTask = (task: MediaTask) => {
    generatingNodes.value.add(task.id);
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

    // 仅处理生成追踪状态
    if (
      status === "completed" ||
      status === "error" ||
      status === "cancelled"
    ) {
      generatingNodes.value.delete(taskId);
    }
  };

  /**
   * 删除任务/消息
   */
  const removeTask = (taskId: string) => {
    // 1. 始终从任务池移除 (修复 bug)
    taskManager.removeTask(taskId);
    generatingNodes.value.delete(taskId);

    // 2. 如果有会话上下文，同步清理节点
    const fullSession = currentFullSession.value;
    if (fullSession) {
      const result = branchManager.deleteMessage(fullSession, taskId);
      if (result.success) {
        activeLeafId.value = fullSession.activeLeafId || "";
        persistence.persist(true);
      }
    }
  };

  /**
   * 编辑消息
   */
  const editMessage = (
    messageId: string,
    content: string,
    attachments?: Asset[]
  ) => {
    const fullSession = currentFullSession.value;
    if (!fullSession) return;
    const success = branchManager.editMessage(
      fullSession,
      messageId,
      content,
      attachments
    );
    if (success) {
      persistence.persist(true);
    }
  };

  // --- 状态自愈 Watcher ---
  // 这个 Watch 负责监控"僵死节点"。
  // 如果任务池里的任务结束了，但节点还卡在 generating，我们会自动把它修好。
  watch(
    () => generatingNodes.value.size,
    (newSize, oldSize) => {
      if (newSize < (oldSize || 0)) {
        // 任务减少了，检查是否有漏网之鱼
        Object.values(nodes.value).forEach((node) => {
          if (
            node.status === "generating" &&
            !generatingNodes.value.has(node.id)
          ) {
            const task = taskManager.getTask(node.id);
            if (
              !task ||
              task.status === "completed" ||
              task.status === "error"
            ) {
              logger.warn("检测到僵死节点，正在自动修复状态", {
                nodeId: node.id,
              });
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

    const index = sessionIndexMap.value.get(sessionId);
    if (!index) return;

    // 按需加载详情
    let detail = sessionDetailMap.value.get(sessionId);
    if (!detail) {
      const { useMediaStorage } =
        await import("../composables/useMediaStorage");
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
        currentConfig.value.activeType =
          detail.generationConfig.activeType || "image";
        if (detail.generationConfig.types) {
          currentConfig.value.types = {
            ...currentConfig.value.types,
            ...detail.generationConfig.types,
          };
        }
      }

      // 仅更新当前活跃 ID，不触发全量持久化，也不更新时间戳
      await persistence.updateCurrentSessionIdInStorage(sessionId);
      logger.info("已切换会话", { sessionId });
    }
  };

  /**
   * 创建新会话
   */
  const createNewSession = async () => {
    await persistence.persist();
    const { index, detail } = sessionManager.createSessionObject(
      `新生成会话 ${sessionIndexMap.value.size + 1}`
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
      // 重新 set 以触发 Map 的响应式更新
      sessionIndexMap.value.set(sessionId, { ...index });

      if (detail) {
        detail.updatedAt = index.updatedAt;
        sessionDetailMap.value.set(sessionId, { ...detail });
        await sessionManager.persistSession({ ...index, ...detail });
      } else {
        // 如果详情没加载，可能需要特殊的持久化逻辑，或者先加载详情
        // 这里简单处理：如果详情没加载，只更新索引（假设存储层支持）
        const { useMediaStorage } =
          await import("../composables/useMediaStorage");
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
      // 切换分支属于明确的 UI 状态变更，需要持久化（但不一定更新时间，Chat 默认也不更新切换分支的时间）
      persistence.persist(false);
    }
  };

  /**
   * 从指定节点重新生成 (重试/分支)
   */
  const regenerateFromNode = async (
    messageId: string,
    temporaryModel?: { profileId: string; modelId: string }
  ) => {
    const fullSession = currentFullSession.value;
    if (!fullSession) return;

    // 1. 调用 nodeManager 创建兄弟分支
    const branch = nodeManager.createRegenerateBranch(fullSession, messageId);
    if (!branch) {
      logger.warn("创建重试分支失败");
      return;
    }

    const { assistantNode } = branch;

    // 2. 获取重试参数
    const params = taskActionManager.getRetryParams(messageId);
    if (!params || !params.isMediaTask) {
      logger.warn("无法获取重试参数");
      return;
    }

    // 3. 构造新 Task
    const generationOptions = { ...params.options } as any;
    if (temporaryModel) {
      generationOptions.profileId = temporaryModel.profileId;
      generationOptions.modelId = temporaryModel.modelId;
    }

    const type =
      params.type ||
      assistantNode.metadata?.taskSnapshot?.type ||
      currentConfig.value.activeType;

    const { useMediaGenerationManager } =
      await import("../composables/useMediaGenerationManager");
    const mediaGenManager = useMediaGenerationManager();

    // 复用 buildTask，但强制使用 assistantNode.id 作为 taskId
    const task = mediaGenManager.buildTask(generationOptions, type);
    task.id = assistantNode.id; // 强制关联到节点 ID

    // 4. 写入节点元数据
    assistantNode.metadata = {
      ...assistantNode.metadata,
      taskId: task.id,
      isMediaTask: true,
      includeContext: task.input.includeContext,
      taskSnapshot: JSON.parse(JSON.stringify(task)),
    };

    // 5. 加入任务池并追踪
    tasks.value.unshift(task);
    generatingNodes.value.add(task.id);
    activeLeafId.value = task.id;

    persistence.persist(true);

    // 6. 启动生成
    await mediaGenManager.startGenerationWithTask(task);
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
    submitTaskInSession,
    addTask,
    updateTaskStatus,
    getTask: taskManager.getTask,
    removeTask,
    deleteMessage: (id: string) => removeTask(id),
    editMessage,
    saveToBranch: (
      messageId: string,
      content: string,
      attachments?: Asset[]
    ) => {
      const fullSession = currentFullSession.value;
      if (!fullSession) return;

      const node = nodes.value[messageId];
      if (!node) return;

      // 对齐 Chat 逻辑：创建新分支并应用新内容
      const newNodeId = branchManager.createBranch(fullSession, messageId);
      if (newNodeId) {
        // 如果是 User 节点，应用新内容
        if (node.role === "user") {
          branchManager.editMessage(
            fullSession,
            newNodeId,
            content,
            attachments
          );
        }
        // Assistant 节点的 createBranch 已经复制了内容，无需额外操作
        activeLeafId.value = newNodeId;
        persistence.persist(true);
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
      currentFullSession.value
        ? branchManager.getSiblings(currentFullSession.value, id)
        : [],
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
        persistence.persist(true);
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

      if (
        sanitizedData.metadata?.taskSnapshot &&
        sanitizedData.metadata.taskId
      ) {
        taskManager.updateTaskStatus(
          sanitizedData.metadata.taskId,
          sanitizedData.metadata.taskSnapshot.status,
          sanitizedData.metadata.taskSnapshot
        );
      }
      persistence.persist(true);
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
    regenerateFromNode,
    getRetryParams: taskActionManager.getRetryParams,
  };
});
