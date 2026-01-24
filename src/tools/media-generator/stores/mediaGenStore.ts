import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
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
import { useMediaStorage } from "../composables/useMediaStorage";
import type { Asset } from "@/types/asset-management";
import { useNodeManager } from "../composables/useNodeManager";
import { useBranchManager } from "../composables/useBranchManager";
import { useSessionManager } from "../composables/useSessionManager";
import { useAttachmentManager } from "../composables/useAttachmentManager";
import { useTaskActionManager } from "../composables/useTaskActionManager";
import { useLlmRequest } from "@/composables/useLlmRequest";

const logger = createModuleLogger("media-generator/store");

export const useMediaGenStore = defineStore("media-generator", () => {
  const storage = useMediaStorage();
  const nodeManager = useNodeManager();
  const branchManager = useBranchManager();
  const sessionManager = useSessionManager();
  const attachmentManager = useAttachmentManager();
  const { sendRequest } = useLlmRequest();
  const debouncedSave = storage.createDebouncedSave(2000);

  const sessions = ref<GenerationSession[]>([]);
  const nodes = ref<Record<string, MediaMessage>>({});
  const rootNodeId = ref("");
  const activeLeafId = ref("");
  const tasks = ref<MediaTask[]>([]);
  const activeTaskId = ref<string | null>(null);
  const currentSessionId = ref<string | null>(null);
  const isInitialized = ref(false);
  const isNaming = ref(false);

  // 获取当前会话对象
  const currentSession = computed(() => {
    if (!currentSessionId.value) return null;
    return sessions.value.find((s) => s.id === currentSessionId.value) || null;
  });

  // 输入内容管理
  const inputPrompt = ref("");

  // 消息流 (计算属性，基于当前活跃路径)
  const messages = computed(() => {
    if (!currentSessionId.value || !activeLeafId.value) return [];

    // 构造一个临时的 session 对象供 nodeManager 使用
    const tempSession = {
      id: currentSessionId.value,
      nodes: nodes.value,
      rootNodeId: rootNodeId.value,
      activeLeafId: activeLeafId.value,
    } as any;

    return nodeManager.getNodePath(tempSession, activeLeafId.value) as MediaMessage[];
  });

  // 全局设置
  const settings = ref<MediaGeneratorSettings>({ ...DEFAULT_MEDIA_GENERATOR_SETTINGS });

  // 当前生成配置
  const currentConfig = ref({
    activeType: "image" as MediaTaskType,
    includeContext: false, // 是否包含上下文
    types: {
      image: sessionManager.createDefaultTypeConfig(),
      video: sessionManager.createDefaultTypeConfig(),
      audio: sessionManager.createDefaultTypeConfig(),
    },
  });

  // 业务逻辑管理
  const taskActionManager = useTaskActionManager({
    nodes,
    tasks,
    activeLeafId,
    rootNodeId,
    currentConfig,
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

      const { sessions: loadedSessions, currentSessionId: savedSessionId } =
        await sessionManager.loadSessions();
      sessions.value = loadedSessions as GenerationSession[];

      let session: GenerationSession | null = null;

      if (savedSessionId) {
        session =
          (loadedSessions.find((s) => s.id === savedSessionId) as GenerationSession) || null;
      }

      // 如果没有保存的会话，创建一个默认的
      if (!session) {
        if (loadedSessions.length > 0) {
          session = loadedSessions[0] as GenerationSession;
        } else {
          session = sessionManager.createSessionObject("默认生成会话");
          sessions.value = [session];
          await sessionManager.persistSession(session);
        }
      }

      if (!session) return; // 理论上不会发生

      // 应用加载的数据
      currentSessionId.value = session.id;
      tasks.value = session.tasks || [];

      // 初始化节点树
      nodes.value = session.nodes || {};
      rootNodeId.value = session.rootNodeId || "";
      activeLeafId.value = session.activeLeafId || "";

      // 如果没有根节点，创建一个
      if (!rootNodeId.value) {
        const rootNode = nodeManager.createNode({
          role: "system",
          content: "Media Generation Root",
          parentId: null,
          name: "Root",
        }) as MediaMessage;
        nodes.value[rootNode.id] = rootNode;
        rootNodeId.value = rootNode.id;
        activeLeafId.value = rootNode.id;
      }

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

      isInitialized.value = true;
      logger.info("Store 初始化完成", { sessionId: session.id, taskCount: tasks.value.length });
    } catch (error) {
      logger.error("Store 初始化失败", error);
    }
  };

  /**
   * 持久化当前状态
   */
  const persist = async () => {
    if (!currentSessionId.value) return;

    const session = sessions.value.find((s) => s.id === currentSessionId.value);
    if (!session) return;

    // 更新当前会话的状态
    session.updatedAt = new Date().toISOString();
    session.tasks = tasks.value;
    session.inputPrompt = inputPrompt.value;
    session.generationConfig = {
      activeType: currentConfig.value.activeType,
      includeContext: currentConfig.value.includeContext,
      types: JSON.parse(JSON.stringify(currentConfig.value.types)),
    };
    session.nodes = nodes.value;
    session.rootNodeId = rootNodeId.value;
    session.activeLeafId = activeLeafId.value;

    await sessionManager.persistSession(session);
  };

  // 监听配置和输入变化自动保存
  watch(
    [currentConfig, inputPrompt, nodes, activeLeafId],
    () => {
      if (!isInitialized.value || !currentSessionId.value) return;

      const session = sessions.value.find((s) => s.id === currentSessionId.value);
      if (!session) return;

      // 更新内存中的 session 对象
      session.updatedAt = new Date().toISOString();
      session.tasks = tasks.value;
      session.inputPrompt = inputPrompt.value;
      session.generationConfig = {
        activeType: currentConfig.value.activeType,
        includeContext: currentConfig.value.includeContext,
        types: JSON.parse(JSON.stringify(currentConfig.value.types)),
      };
      session.nodes = nodes.value;
      session.rootNodeId = rootNodeId.value;
      session.activeLeafId = activeLeafId.value;

      debouncedSave(session, currentSessionId.value);
    },
    { deep: true }
  );

  // 监听全局设置变化自动保存
  watch(
    settings,
    (newSettings) => {
      if (!isInitialized.value) return;
      storage.saveSettings(newSettings);
      logger.debug("全局设置已保存");
    },
    { deep: true }
  );

  /**
   * 添加新任务（同时生成消息流）
   */
  const addTask = (task: MediaTask) => {
    taskActionManager.addTaskNode(task, attachmentManager.attachments.value);

    // 自动命名逻辑
    if (
      settings.value.enableAutoNaming &&
      !isNaming.value &&
      currentSession.value &&
      currentSession.value.name.startsWith("新生成会话") &&
      settings.value.topicNaming.modelCombo
    ) {
      // 延迟触发，确保任务已经进入列表
      setTimeout(() => {
        generateSessionName(currentSessionId.value!).catch((err) => {
          logger.error("自动命名失败", err);
        });
      }, 1500);
    }

    // 清空当前附件（已转入消息上下文）
    attachmentManager.clearAttachments();
    persist();
  };

  /**
   * 切换消息选中状态（上下文选取）
   */
  const toggleMessageSelection = (messageId: string) => {
    const msg = nodes.value[messageId];
    if (msg) {
      msg.isSelected = !msg.isSelected;
      logger.debug("消息选中状态变更", { messageId, isSelected: msg.isSelected });
    }
  };

  /**
   * 获取当前选中的上下文
   */
  const getSelectedContext = computed(() => {
    return messages.value.filter((m) => m.isSelected);
  });

  /**
   * 更新任务状态
   */
  const updateTaskStatus = (
    taskId: string,
    status: MediaTaskStatus,
    updates?: Partial<MediaTask>
  ) => {
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      if (updates) {
        Object.assign(task, updates);
      }
      if (status === "completed") {
        task.completedAt = Date.now();
      }
      logger.debug("任务状态已更新", { taskId, status });
      persist();
    }
  };

  /**
   * 获取任务
   */
  const getTask = (taskId: string) => {
    return tasks.value.find((t) => t.id === taskId);
  };

  /**
   * 删除任务
   */
  const removeTask = (taskId: string) => {
    if (!currentSession.value) return;

    // 使用 branchManager 进行硬删除，它会自动处理任务清理
    const result = branchManager.deleteMessage(currentSession.value, taskId);

    if (result.success) {
      activeLeafId.value = currentSession.value.activeLeafId;
      // 同步顶层 tasks ref
      tasks.value = currentSession.value.tasks;
      persist();
    }
  };

  /**
   * 删除消息
   */
  const deleteMessage = (messageId: string) => {
    removeTask(messageId);
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
    if (success) {
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

    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      currentSessionId.value = session.id;
      tasks.value = session.tasks || [];

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
    // 先保存当前会话
    await persist();

    const session = sessionManager.createSessionObject(`新生成会话 ${sessions.value.length + 1}`);

    sessions.value.unshift(session);
    currentSessionId.value = session.id;
    tasks.value = [];
    nodes.value = session.nodes;
    rootNodeId.value = session.rootNodeId;
    activeLeafId.value = session.activeLeafId;
    inputPrompt.value = "";
    currentConfig.value.activeType = "image";

    await sessionManager.persistSession(session);
    logger.info("已创建新会话", { sessionId: session.id });
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
    logger.info("已删除会话", { sessionId });
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
   * AI 自动命名会话
   */
  const generateSessionName = async (sessionId: string) => {
    if (isNaming.value) return;

    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) return;

    const namingConfig = settings.value.topicNaming;
    if (!namingConfig.modelCombo) {
      throw new Error("请先在设置中配置命名模型");
    }

    // 提取上下文：使用任务内容
    const context = (session.tasks || [])
      .map((t) => t.input?.prompt)
      .filter(Boolean)
      .slice(0, 5) // 仅取前5个任务作为上下文，避免上下文过长
      .join("\n");

    if (!context) return;

    // LlmModelSelector 返回的格式通常是 profileId:modelId
    const [profileId, modelId] = namingConfig.modelCombo.includes(":")
      ? namingConfig.modelCombo.split(":")
      : namingConfig.modelCombo.split("/");

    try {
      isNaming.value = true;
      const prompt = namingConfig.prompt.replace("{context}", context);
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: namingConfig.temperature,
        maxTokens: namingConfig.maxTokens,
      });

      // 提取名称：去掉引号、去掉“标题：”或“Title:”前缀、去掉 Markdown 粗体等格式
      let newName = response.content
        .trim()
        .replace(/^["'「『]|["'」』]$/g, "")
        .replace(/^(标题|名称|Title|Name)[:：]\s*/i, "")
        .replace(/[*#_~`>]/g, "") // 移除常见的 MD 符号
        .trim();

      if (newName && newName !== session.name) {
        await updateSessionName(sessionId, newName);
        logger.info("AI 命名成功", { sessionId, newName });
      }
    } catch (error) {
      logger.error("AI 命名失败", error);
      throw error;
    } finally {
      isNaming.value = false;
    }
  };
  /**
   * 分支切换
   */
  const switchToBranch = (nodeId: string) => {
    if (!currentSession.value) return;
    const success = branchManager.switchBranch(currentSession.value, nodeId);
    if (success) {
      activeLeafId.value = nodeId;
      persist();
    }
  };

  /**
   * 获取兄弟节点
   */
  const getSiblings = (nodeId: string) => {
    if (!currentSession.value) return [];
    return branchManager.getSiblings(currentSession.value, nodeId);
  };

  /**
   * 判断节点是否在当前活动路径上
   */
  const isNodeInActivePath = (nodeId: string) => {
    if (!currentSession.value) return false;
    return branchManager.isNodeInActivePath(currentSession.value, nodeId);
  };

  return {
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
    isInitialized,
    inputPrompt,
    // 附件状态委托
    attachments: attachmentManager.attachments,
    isProcessingAttachments: attachmentManager.isProcessingAttachments,
    maxAttachmentCount: attachmentManager.maxAttachmentCount,
    attachmentCount: attachmentManager.attachmentCount,
    hasAttachments: attachmentManager.hasAttachments,
    isAttachmentsFull: attachmentManager.isAttachmentsFull,
    init,
    persist,
    addTask,
    updateTaskStatus,
    getTask,
    removeTask,
    deleteMessage,
    editMessage,
    toggleMessageSelection,
    getSelectedContext,
    switchSession,
    createNewSession,
    deleteSession,
    updateSessionName,
    generateSessionName,
    isNaming,
    switchToBranch,
    getSiblings,
    isNodeInActivePath,
    // 附件方法委托
    addAsset: attachmentManager.addAsset,
    removeAttachment: attachmentManager.removeAttachment,
    clearAttachments: attachmentManager.clearAttachments,
    currentSession,
    /**
     * 重试生成
     * 返回重试所需的任务参数，由 UI 层调用生成管理器
     */
    getRetryParams(messageId: string) {
      const node = nodes.value[messageId];
      if (!node) return null;

      // 切换到该节点所在的分支，确保后续操作在正确的上下文中
      switchToBranch(node.id);

      return taskActionManager.getRetryParams(messageId);
    },
  };
});
