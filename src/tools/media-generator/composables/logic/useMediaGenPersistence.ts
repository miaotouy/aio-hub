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
