import { ref, watch } from "vue";
import { debounce } from "lodash-es";
import type {
  GenerationSession,
  GenerationSessionDetail,
  MediaSessionIndexItem,
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
  sessionIndexMap: { value: Map<string, MediaSessionIndexItem> };
  sessionDetailMap: { value: Map<string, GenerationSessionDetail> };
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

      const { sessions: loadedIndexItems, currentSessionId: savedSessionId } = await sessionManager.loadSessionsIndex();

      // 填充索引 Map
      sessionIndexMap.value.clear();
      loadedIndexItems.forEach((item) => {
        sessionIndexMap.value.set(item.id, item);
      });

      let session: GenerationSession | null = null;

      if (savedSessionId) {
        const fullSession = await storage.loadSession(savedSessionId);
        if (fullSession) {
          session = fullSession;
        }
      }

      // 如果没有保存的会话，创建一个默认的
      if (!session) {
        if (loadedIndexItems.length > 0) {
          const firstId = loadedIndexItems[0].id;
          session = await storage.loadSession(firstId);
        } else {
          const { index, detail } = sessionManager.createSessionObject("默认生成会话");
          sessionIndexMap.value.set(index.id, index);
          sessionDetailMap.value.set(detail.id, detail);
          session = { ...index, ...detail };
          await sessionManager.persistSession(session);
        }
      }

      if (!session) return;

      // 应用加载的数据
      currentSessionId.value = session.id;

      // 存入详情 Map
      sessionDetailMap.value.set(session.id, {
        id: session.id,
        type: session.type,
        generationConfig: session.generationConfig,
        nodes: session.nodes,
        rootNodeId: session.rootNodeId,
        activeLeafId: session.activeLeafId,
        updatedAt: session.updatedAt,
        inputPrompt: session.inputPrompt,
        history: session.history,
        historyIndex: session.historyIndex,
      });

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
   * @param updateTime 是否更新会话的最后修改时间（默认不更新，由业务逻辑显式触发）
   */
  const persist = async (updateTime = false) => {
    if (!currentSessionId.value) return;

    const index = sessionIndexMap.value.get(currentSessionId.value);
    const detail = sessionDetailMap.value.get(currentSessionId.value);
    if (!index || !detail) return;

    // 更新当前会话的状态
    if (updateTime) {
      const now = new Date().toISOString();
      index.updatedAt = now;
      detail.updatedAt = now;
    }
    detail.inputPrompt = inputPrompt.value;
    detail.generationConfig = {
      activeType: currentConfig.value.activeType,
      includeContext: currentConfig.value.includeContext,
      types: JSON.parse(JSON.stringify(currentConfig.value.types)),
    };
    detail.nodes = nodes.value;
    detail.rootNodeId = rootNodeId.value;
    detail.activeLeafId = activeLeafId.value;

    // 更新任务计数
    sessionManager.updateTaskCount(currentSessionId.value, nodes.value, sessionIndexMap.value);

    await storage.persistSession({ ...index, ...detail }, currentSessionId.value);
  };

  // 创建 Store 级防抖保存
  const debouncedPersist = debounce(async () => {
    await persist();
  }, 1000);

  // 仅监听输入和配置的防抖保存（不更新 updatedAt）
  watch(
    [inputPrompt, currentConfig],
    () => {
      if (!isInitialized.value || !currentSessionId.value) return;

      const detail = sessionDetailMap.value.get(currentSessionId.value);
      if (!detail) return;

      // 仅同步配置类状态
      detail.inputPrompt = inputPrompt.value;
      detail.generationConfig = {
        activeType: currentConfig.value.activeType,
        includeContext: currentConfig.value.includeContext,
        types: JSON.parse(JSON.stringify(currentConfig.value.types)),
      };

      debouncedPersist();
    },
    { deep: true },
  );

  // 监听全局设置变化自动保存
  watch(
    () => settings.value,
    (newSettings) => {
      if (!isInitialized.value) return;
      storage.saveSettingsDebounced(newSettings);
    },
    { deep: true },
  );

  /**
   * 更新当前活跃会话 ID（不触发全量保存）
   */
  const updateCurrentSessionIdInStorage = async (sessionId: string | null) => {
    await storage.updateCurrentSessionId(sessionId);
  };

  return {
    isInitialized,
    init,
    persist,
    debouncedPersist,
    updateCurrentSessionIdInStorage,
  };
}
