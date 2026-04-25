import { ref, watch } from "vue";
import { debounce } from "lodash-es";
import type {
  GenerationSession,
  MediaMessage,
  MediaGeneratorSettings,
  MediaTask,
  MediaTaskType,
} from "../../types";
import { DEFAULT_MEDIA_GENERATOR_SETTINGS } from "../../config";
import { createModuleLogger } from "@/utils/logger";
import { useMediaStorage } from "../useMediaStorage";
import { useSessionManager } from "../useSessionManager";
import { useMediaTaskManager } from "../useMediaTaskManager";
import { useNodeManager } from "../useNodeManager";

const logger = createModuleLogger("media-generator/persistence");

export function useMediaGenPersistence(options: {
  sessions: { value: GenerationSession[] };
  nodes: { value: Record<string, MediaMessage> };
  rootNodeId: { value: string };
  activeLeafId: { value: string };
  currentSessionId: { value: string | null };
  inputPrompt: { value: string };
  currentConfig: { value: { activeType: MediaTaskType; includeContext: boolean; types: any } };
  settings: { value: MediaGeneratorSettings };
  tasks: { value: MediaTask[] };
}) {
  const {
    sessions,
    nodes,
    rootNodeId,
    activeLeafId,
    currentSessionId,
    inputPrompt,
    currentConfig,
    settings,
    tasks,
  } = options;

  const storage = useMediaStorage();
  const sessionManager = useSessionManager();
  const taskManager = useMediaTaskManager();
  const nodeManager = useNodeManager();

  const isInitialized = ref(false);

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

      if (!session) return;

      // 应用加载的数据
      currentSessionId.value = session.id;

      // 初始化全局任务管理器
      await taskManager.init();

      // 初始化节点树
      nodes.value = session.nodes || {};

      // 自愈逻辑：处理加载时处于 generating 状态的节点
      // 姐姐，媒体生成任务通常无法跨进程恢复，所以加载时如果是生成中，我会把它修成 error
      Object.values(nodes.value).forEach((node) => {
        if (node.status === "generating") {
          // 检查是否有关联的任务且任务已完成
          const task = taskManager.getTask(node.id);
          if (task && task.status === "completed") {
            node.status = "complete";
          } else {
            node.status = "error";
            if (!node.metadata) node.metadata = {};
            node.metadata.error = "应用重启，生成中断";
          }
        }
      });

      rootNodeId.value = session.rootNodeId || "";
      activeLeafId.value = session.activeLeafId || "";

      // 自愈逻辑：确保 activeLeafId 指向最深叶子节点，且节点存在
      if (activeLeafId.value && nodes.value[activeLeafId.value]) {
        const activeNode = nodes.value[activeLeafId.value];
        if (activeNode.childrenIds.length > 0) {
          const tempSession = {
            id: session.id,
            nodes: nodes.value,
            rootNodeId: rootNodeId.value,
            activeLeafId: activeLeafId.value,
          } as GenerationSession;
          activeLeafId.value = nodeManager.findDeepestLeaf(tempSession, activeLeafId.value);
          logger.warn("检测到 activeLeafId 指向中间节点，已自动修复", {
            sessionId: session.id,
            fixedId: activeLeafId.value,
          });
        }
      } else if (rootNodeId.value) {
        activeLeafId.value = rootNodeId.value;
      }

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
    session.inputPrompt = inputPrompt.value;
    session.generationConfig = {
      activeType: currentConfig.value.activeType,
      includeContext: currentConfig.value.includeContext,
      types: JSON.parse(JSON.stringify(currentConfig.value.types)),
    };
    session.nodes = nodes.value;
    session.rootNodeId = rootNodeId.value;
    session.activeLeafId = activeLeafId.value;

    await storage.persistSession(session, currentSessionId.value);
  };

  // 创建 Store 级防抖保存
  const debouncedPersist = debounce(async () => {
    await persist();
  }, 1000);

  // 监听配置和输入变化自动保存
  watch(
    [currentConfig, inputPrompt, nodes, activeLeafId, tasks],
    () => {
      if (!isInitialized.value || !currentSessionId.value) return;

      const session = sessions.value.find((s) => s.id === currentSessionId.value);
      if (!session) return;

      // 更新内存中的 session 对象（用于即时 UI 反馈）
      session.updatedAt = new Date().toISOString();
      session.inputPrompt = inputPrompt.value;
      session.generationConfig = {
        activeType: currentConfig.value.activeType,
        includeContext: currentConfig.value.includeContext,
        types: JSON.parse(JSON.stringify(currentConfig.value.types)),
      };
      session.nodes = nodes.value;
      session.rootNodeId = rootNodeId.value;
      session.activeLeafId = activeLeafId.value;

      // 触发防抖持久化
      debouncedPersist();
    },
    { deep: true }
  );

  // 监听全局设置变化自动保存
  watch(
    () => settings.value,
    (newSettings) => {
      if (!isInitialized.value) return;
      storage.saveSettingsDebounced(newSettings);
    },
    { deep: true }
  );

  return {
    isInitialized,
    init,
    persist,
    debouncedPersist,
  };
}
