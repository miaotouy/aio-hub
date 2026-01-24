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
import { v4 as uuidv4 } from "uuid";
import type { Asset } from "@/types/asset-management";
import { useNodeManager } from "@/tools/llm-chat/composables/useNodeManager";

const logger = createModuleLogger("media-generator/store");

export const useMediaGenStore = defineStore("media-generator", () => {
  const storage = useMediaStorage();
  const nodeManager = useNodeManager();
  const debouncedSave = storage.createDebouncedSave(2000);

  const sessions = ref<GenerationSession[]>([]);
  const nodes = ref<Record<string, MediaMessage>>({});
  const rootNodeId = ref("");
  const activeLeafId = ref("");
  const tasks = ref<MediaTask[]>([]);
  const activeTaskId = ref<string | null>(null);
  const currentSessionId = ref<string | null>(null);
  const isInitialized = ref(false);

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
    modelCombo: "",
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
      duration: 5, // 视频时长默认 5s
    },
  });

  // 当前生成配置
  const currentConfig = ref({
    activeType: "image" as MediaTaskType,
    includeContext: false, // 是否包含上下文
    types: {
      image: createDefaultTypeConfig(),
      video: createDefaultTypeConfig(),
      audio: createDefaultTypeConfig(),
    },
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
        await storage.loadSessions();
      sessions.value = loadedSessions;

      let session: GenerationSession | null = null;

      if (savedSessionId) {
        session = loadedSessions.find((s) => s.id === savedSessionId) || null;
      }

      // 如果没有保存的会话，创建一个默认的
      if (!session) {
        if (loadedSessions.length > 0) {
          session = loadedSessions[0];
        } else {
          const newId = uuidv4();
          session = {
            id: newId,
            name: "默认生成会话",
            type: "media-gen",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            tasks: [],
            generationConfig: {
              activeType: "image",
              includeContext: false,
              types: {
                image: createDefaultTypeConfig(),
                video: createDefaultTypeConfig(),
                audio: createDefaultTypeConfig(),
              },
            },
            nodes: {},
            rootNodeId: "",
            activeLeafId: "",
            inputPrompt: "",
          };
          sessions.value = [session];
          await storage.persistSession(session, newId);
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

      // 数据迁移逻辑
      const oldMessages = session.messages || [];
      if (oldMessages.length > 0 && Object.keys(nodes.value).length === 0) {
        logger.info("执行数据迁移：从扁平消息数组构建节点树");

        // 1. 创建根节点
        const rootNode = nodeManager.createNode({
          role: "system",
          content: "Media Generation Root",
          parentId: null,
          name: "Root",
        }) as MediaMessage;

        nodes.value[rootNode.id] = rootNode;
        rootNodeId.value = rootNode.id;

        // 2. 按顺序挂载旧消息
        let lastId = rootNode.id;
        oldMessages.forEach((msg) => {
          const newNode = {
            ...msg,
            parentId: lastId,
            childrenIds: [],
            status: msg.role === "assistant" ? "complete" : "complete",
            timestamp:
              typeof msg.timestamp === "number"
                ? new Date(msg.timestamp).toISOString()
                : msg.timestamp,
          } as MediaMessage;

          nodes.value[newNode.id] = newNode;
          if (nodes.value[lastId]) {
            nodes.value[lastId].childrenIds.push(newNode.id);
          }
          lastId = newNode.id;
        });

        activeLeafId.value = lastId;
      } else if (tasks.value.length > 0 && Object.keys(nodes.value).length === 0) {
        // 数据迁移：如果只有任务没有消息
        logger.info("执行数据迁移：从任务列表生成消息流并构建节点树");

        const rootNode = nodeManager.createNode({
          role: "system",
          content: "Media Generation Root",
          parentId: null,
          name: "Root",
        }) as MediaMessage;

        nodes.value[rootNode.id] = rootNode;
        rootNodeId.value = rootNode.id;

        let lastId = rootNode.id;
        [...tasks.value].reverse().forEach((task) => {
          // 用户消息
          const userNode = nodeManager.createNode({
            role: "user",
            content: task.input.prompt,
            parentId: lastId,
          }) as MediaMessage;
          userNode.timestamp = new Date(task.createdAt).toISOString();
          nodes.value[userNode.id] = userNode;
          nodes.value[lastId].childrenIds.push(userNode.id);

          // 助手消息
          const assistantNode = nodeManager.createNode({
            role: "assistant",
            content: "",
            parentId: userNode.id,
            status:
              task.status === "completed"
                ? "complete"
                : task.status === "error"
                  ? "error"
                  : "generating",
            metadata: {
              taskId: task.id,
              isMediaTask: true,
            },
          }) as MediaMessage;
          assistantNode.timestamp = new Date(task.completedAt || task.createdAt).toISOString();
          assistantNode.id = task.id; // 保持 ID 一致
          nodes.value[assistantNode.id] = assistantNode;
          nodes.value[userNode.id].childrenIds.push(assistantNode.id);

          lastId = assistantNode.id;
        });

        activeLeafId.value = lastId;
      }

      // 如果还是没有根节点，创建一个
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

    const currentSession = sessions.value.find((s) => s.id === currentSessionId.value);

    const session: GenerationSession = {
      id: currentSessionId.value,
      name: currentSession?.name || "默认生成会话",
      type: "media-gen",
      updatedAt: new Date().toISOString(),
      createdAt: currentSession?.createdAt || new Date().toISOString(),
      tasks: tasks.value,
      inputPrompt: inputPrompt.value,
      generationConfig: {
        activeType: currentConfig.value.activeType,
        includeContext: currentConfig.value.includeContext,
        types: JSON.parse(JSON.stringify(currentConfig.value.types)),
      },
      nodes: nodes.value,
      rootNodeId: rootNodeId.value,
      activeLeafId: activeLeafId.value,
    };

    // 更新 sessions 列表中的元数据
    const index = sessions.value.findIndex((s) => s.id === session.id);
    if (index !== -1) {
      sessions.value[index] = session;
    } else {
      sessions.value.push(session);
    }

    await storage.persistSession(session, currentSessionId.value);
  };

  // 监听配置和输入变化自动保存
  watch(
    [currentConfig, inputPrompt, nodes, activeLeafId],
    () => {
      if (!isInitialized.value || !currentSessionId.value) return;

      const currentSession = sessions.value.find((s) => s.id === currentSessionId.value);
      const session: GenerationSession = {
        id: currentSessionId.value,
        name: currentSession?.name || "默认生成会话",
        type: "media-gen",
        updatedAt: new Date().toISOString(),
        createdAt: currentSession?.createdAt || new Date().toISOString(),
        tasks: tasks.value,
        inputPrompt: inputPrompt.value,
        generationConfig: {
          activeType: currentConfig.value.activeType,
          includeContext: currentConfig.value.includeContext,
          types: JSON.parse(JSON.stringify(currentConfig.value.types)),
        },
        nodes: nodes.value,
        rootNodeId: rootNodeId.value,
        activeLeafId: activeLeafId.value,
      };

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
    // 1. 记录任务
    tasks.value.unshift(task);

    // 2. 创建用户消息节点
    const userNode = nodeManager.createNode({
      role: "user",
      content: task.input.prompt,
      parentId: activeLeafId.value || rootNodeId.value,
      attachments: attachments.value.length > 0 ? [...attachments.value] : undefined,
    }) as MediaMessage;

    nodes.value[userNode.id] = userNode;
    if (userNode.parentId && nodes.value[userNode.parentId]) {
      nodes.value[userNode.parentId].childrenIds.push(userNode.id);
    }

    // 3. 创建助手消息节点（绑定任务）
    const assistantNode = nodeManager.createNode({
      role: "assistant",
      content: "",
      parentId: userNode.id,
      status: "generating",
      metadata: {
        taskId: task.id,
        isMediaTask: true,
        includeContext: task.input.includeContext,
      },
    }) as MediaMessage;

    assistantNode.id = task.id; // 保持 ID 一致，方便追踪
    nodes.value[assistantNode.id] = assistantNode;
    userNode.childrenIds.push(assistantNode.id);

    // 更新活跃叶子
    activeLeafId.value = assistantNode.id;

    logger.info("任务与消息节点已添加", {
      taskId: task.id,
      type: task.type,
      leafId: activeLeafId.value,
    });

    // 清空当前附件（已转入消息上下文）
    clearAttachments();
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
    const taskIndex = tasks.value.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      tasks.value.splice(taskIndex, 1);
    }

    // 同时从节点树中移除关联节点
    if (nodes.value[taskId]) {
      // 简单的硬删除逻辑，不处理子树（通常任务节点是叶子或接近叶子）
      const node = nodes.value[taskId];
      if (node.parentId && nodes.value[node.parentId]) {
        nodes.value[node.parentId].childrenIds = nodes.value[node.parentId].childrenIds.filter(
          (id) => id !== taskId
        );
      }

      // 如果删除的是活跃叶子，需要回退
      if (activeLeafId.value === taskId) {
        activeLeafId.value = node.parentId || rootNodeId.value;
      }

      delete nodes.value[taskId];
    }

    logger.info("任务及其节点已删除", { taskId });
    persist();
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

    const newId = uuidv4();
    const session: GenerationSession = {
      id: newId,
      name: `新生成会话 ${sessions.value.length + 1}`,
      type: "media-gen",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      tasks: [],
      generationConfig: {
        activeType: "image",
        types: {
          image: createDefaultTypeConfig(),
          video: createDefaultTypeConfig(),
          audio: createDefaultTypeConfig(),
        },
      },
      nodes: {},
      rootNodeId: "",
      activeLeafId: "",
      inputPrompt: "",
    };

    // 初始化新会话的根节点
    const rootNode = nodeManager.createNode({
      role: "system",
      content: "Media Generation Root",
      parentId: null,
      name: "Root",
    }) as MediaMessage;
    session.nodes[rootNode.id] = rootNode;
    session.rootNodeId = rootNode.id;
    session.activeLeafId = rootNode.id;

    sessions.value.unshift(session);
    currentSessionId.value = newId;
    tasks.value = [];
    nodes.value = session.nodes;
    rootNodeId.value = session.rootNodeId;
    activeLeafId.value = session.activeLeafId;
    inputPrompt.value = "";
    currentConfig.value.activeType = "image";

    await storage.persistSession(session, newId);
    logger.info("已创建新会话", { sessionId: newId });
  };

  /**
   * 删除会话
   */
  const deleteSession = async (sessionId: string) => {
    await storage.deleteSession(sessionId);
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
      if (sessionId === currentSessionId.value) {
        await persist();
      } else {
        await storage.saveSession(session);
      }
    }
  };

  /**
   * 分支切换
   */
  const switchToBranch = (nodeId: string) => {
    if (!nodes.value[nodeId]) return;
    activeLeafId.value = nodeId;
    logger.info("切换分支", { nodeId });
    persist();
  };

  /**
   * 获取兄弟节点
   */
  const getSiblings = (nodeId: string) => {
    const node = nodes.value[nodeId];
    if (!node) return [];
    const parentId = node.parentId;
    if (!parentId) return [node];
    const parentNode = nodes.value[parentId];
    if (!parentNode) return [node];
    return parentNode.childrenIds.map((id) => nodes.value[id]).filter(Boolean);
  };

  /**
   * 判断节点是否在当前活动路径上
   */
  const isNodeInActivePath = (nodeId: string) => {
    return messages.value.some((m) => m.id === nodeId);
  };

  /**
   * 附件操作
   */
  const addAsset = (asset: Asset) => {
    if (isAttachmentsFull.value) return false;
    if (attachments.value.some((a) => a.id === asset.id)) return false;
    attachments.value.push(asset);
    return true;
  };

  const removeAttachment = (assetId: string) => {
    attachments.value = attachments.value.filter((a) => a.id !== assetId);
  };

  const clearAttachments = () => {
    attachments.value = [];
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
    toggleMessageSelection,
    getSelectedContext,
    switchSession,
    createNewSession,
    deleteSession,
    updateSessionName,
    switchToBranch,
    getSiblings,
    isNodeInActivePath,
    addAsset,
    removeAttachment,
    clearAttachments,
    currentSession,
  };
});
