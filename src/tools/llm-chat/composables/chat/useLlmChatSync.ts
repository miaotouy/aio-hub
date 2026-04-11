/**
 * LLM Chat 状态同步 Composable
 *
 * 封装了 LlmChat.vue 与分离窗口之间的所有状态同步和操作代理逻辑
 */
import { toRef, type Ref, watch, computed, onUnmounted } from "vue";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useWorldbookStore } from "../../stores/worldbookStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useLlmChatUiState } from "../ui/useLlmChatUiState";
import { useChatSettings } from "../settings/useChatSettings";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { createModuleLogger } from "@/utils/logger";
import type { LlmChatStateKey } from "../../types/sync";
import { CHAT_STATE_KEYS, createChatSyncConfig } from "../../types/sync";
import type { ChatSessionIndex } from "../../types";

const logger = createModuleLogger("LlmChatSync");

export function useLlmChatSync() {
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const worldbookStore = useWorldbookStore();
  const { currentAgentId } = useLlmChatUiState();
  const { settings } = useChatSettings();
  const toolCallingStore = useToolCallingStore();
  const bus = useWindowSyncBus();

  // 状态同步引擎实例化（延迟初始化）
  let isInitialized = false;
  // 收集所有状态同步引擎实例，用于批量操作
  const stateEngines: ReturnType<typeof useStateSyncEngine>[] = [];

  // 在组件卸载时手动清理所有异步创建的引擎
  // 必须在 setup 期间注册，而不是在 initialize (可能异步) 中注册
  onUnmounted(() => {
    if (stateEngines.length > 0) {
      logger.info("组件卸载，清理所有同步引擎", { count: stateEngines.length });
      stateEngines.forEach((engine) => engine.cleanup());
      stateEngines.length = 0;
    }
  });

  /**
   * 清理所有同步引擎
   */
  function cleanupEngines() {
    if (stateEngines.length > 0) {
      logger.info("清理所有同步引擎", { count: stateEngines.length });
      stateEngines.forEach((engine) => engine.cleanup());
      stateEngines.length = 0;
    }
    isInitialized = false;
  }

  /**
   * 初始化同步引擎
   * 必须在数据加载完成后调用
   */
  function initialize() {
    if (isInitialized) {
      logger.warn("同步引擎已初始化，跳过重复初始化");
      return;
    }

    // 清理旧引擎，以防万一
    cleanupEngines();

    // 1. 状态定义 - 同步完整的 Store 状态，而不是衍生状态
    const allAgents = toRef(agentStore, "agents");

    // 性能优化：同步会话列表时只同步索引信息
    // 由于 store.sessions 已经是 computed 的索引数组，直接使用即可
    const allSessionsIndex = computed({
      get: () => store.sessions,
      set: (val) => {
        if (Array.isArray(val) && bus.windowType === "detached-component") {
          logger.debug("同步引擎尝试写入会话列表", { count: val.length });
          store.setSessions(val);
        }
      },
    });

    // 使用 computed 获取当前会话对象，用于单独同步
    // 注意：这里发送的是 Detail，消费端需要对应处理
    const currentSessionData = computed({
      get: () => store.currentSessionDetail,
      set: (val) => {
        // 仅在非 Data Owner 窗口（如 detached-component）中应用同步过来的数据
        if (val && val.id && (bus.windowType === "detached-component")) {
          // 增加更详细的日志，方便排查加载问题
          const nodeCount = Object.keys(val.nodes || {}).length;
          logger.info("同步引擎应用会话详情", {
            sessionId: val.id,
            nodeCount,
            activeLeafId: val.activeLeafId
          });
          
          store.sessionDetailMap.set(val.id, val);
          
          // 如果当前 ID 不匹配，也同步更新 ID，确保 UI 能够响应
          if (store.currentSessionId !== val.id) {
            logger.info("同步引擎顺便更新了 currentSessionId", { old: store.currentSessionId, new: val.id });
            store.currentSessionId = val.id;
          }
        }
      },
    });

    const currentSessionId = toRef(store, "currentSessionId");
    const isSending = toRef(store, "isSending");
    // 将 generatingNodes Set 转换为数组进行同步
    const generatingNodesArray = computed(() => Array.from(store.generatingNodes));
    const userProfiles = toRef(userProfileStore, "profiles");
    const globalProfileId = toRef(userProfileStore, "globalProfileId");
    // 同步工具调用请求（排除不可序列化的 resolve 函数）
    const toolPendingRequests = computed(() =>
      toolCallingStore.pendingRequests.map((r) => {
        const { resolve, ...serializable } = r;
        return serializable;
      }),
    );

    const createStateEngine = <T>(stateSource: Ref<T>, stateKey: LlmChatStateKey) => {
      // 创建引擎并收集到数组中
      const engine = useStateSyncEngine(stateSource, createChatSyncConfig(stateKey));
      stateEngines.push(engine);
      return engine;
    };

    // 同步完整的智能体列表
    createStateEngine(allAgents, CHAT_STATE_KEYS.AGENTS);
    // 同步当前选中的智能体ID（全局）
    createStateEngine(currentAgentId, CHAT_STATE_KEYS.CURRENT_AGENT_ID);
    // 同步会话列表索引（不包含消息树）
    createStateEngine(allSessionsIndex as Ref<ChatSessionIndex[]>, CHAT_STATE_KEYS.SESSIONS);

    // 同步当前会话的完整数据
    const sessionDataEngine = createStateEngine(currentSessionData as Ref<any>, CHAT_STATE_KEYS.CURRENT_SESSION_DATA);

    // 步骤 3：同步引擎降频
    // 监听发送状态，动态调整同步频率
    watch(isSending, (sending) => {
      if (bus.windowType === "main" || bus.windowType === "detached-tool") {
        if (sending) {
          logger.info("检测到正在发送消息，调低全量同步频率 (2000ms)");
          sessionDataEngine.setDebounce(2000);
        } else {
          logger.info("发送结束，恢复全量同步频率 (100ms) 并执行全量广播");
          sessionDataEngine.setDebounce(100);
          // 强制执行一次全量同步作为生成结束后的兜底
          sessionDataEngine.manualPush(true);
        }
      }
    });

    // 同步当前激活的会话ID
    createStateEngine(currentSessionId, CHAT_STATE_KEYS.CURRENT_SESSION_ID);
    // 同步发送状态
    createStateEngine(isSending, CHAT_STATE_KEYS.IS_SENDING);
    // 同步正在生成的节点列表
    createStateEngine(generatingNodesArray as Ref<string[]>, CHAT_STATE_KEYS.GENERATING_NODES);
    // 同步用户档案列表
    createStateEngine(userProfiles, CHAT_STATE_KEYS.USER_PROFILES);
    // 同步全局用户档案ID
    createStateEngine(globalProfileId, CHAT_STATE_KEYS.GLOBAL_PROFILE_ID);
    // 同步聊天设置（UI偏好、快捷键等）
    createStateEngine(settings, CHAT_STATE_KEYS.SETTINGS);
    // 同步工具调用请求
    createStateEngine(toolPendingRequests as Ref<any[]>, CHAT_STATE_KEYS.TOOL_PENDING_REQUESTS);

    // 同步世界书索引
    worldbookStore.initializeSync();

    // 步骤 2：流式增量通道接收端
    // 只有非 Data Owner 窗口需要监听并应用增量
    if (bus.windowType === "detached-component") {
      const unlistenDelta = bus.onMessage<any>("state-sync", (payload) => {
        if (payload.stateType === "chat:streaming-delta") {
          const { sessionId, nodeId, delta, isReasoning } = payload.data;

          // 定位本地 Store 中的节点并更新
          const detail = store.sessionDetailMap.get(sessionId);
          if (detail && detail.nodes && detail.nodes[nodeId]) {
            const node = detail.nodes[nodeId];

            // 使用 useStateSyncEngine 的标志位避免触发反向同步
            // 注意：这里需要从引擎中获取标志位或者直接操作，但由于我们是直接修改 store，
            // 而 store 上的 watch 是由引擎管理的。
            // 实际上，detached-component 通常不推送 CURRENT_SESSION_DATA，所以风险较小。
            if (isReasoning) {
              if (!node.metadata) node.metadata = {};
              node.metadata.reasoningContent = (node.metadata.reasoningContent || "") + delta;
            } else {
              node.content = (node.content || "") + delta;
            }
          }
        }
      });
      // 注册清理
      onUnmounted(() => unlistenDelta());
    }

    // 【重要】在非主窗口中，监听同步过来的 settings 变化
    if (bus.windowType !== "main") {
      watch(
        settings,
        (newSettings) => {
          logger.info("分离窗口接收到设置同步", {
            isStreaming: newSettings.uiPreferences.isStreaming,
            windowType: bus.windowType,
          });
        },
        { deep: true, immediate: true },
      );
    }

    // 当组件被重新附加时，强制进行一次全量状态广播
    if (bus.windowType === "main" || bus.windowType === "detached-tool") {
      const detachedManager = useDetachedManager();
      watch(
        () => detachedManager.detachedComponents.value.length,
        (newLength, oldLength) => {
          // 只有当组件数量减少时，才认为是“还原”操作
          if (typeof oldLength === "number" && newLength < oldLength) {
            logger.info("检测到组件重新附着，强制进行全量状态广播", {
              windowType: bus.windowType,
              newLength,
              oldLength,
            });
            for (const engine of stateEngines) {
              // 强制推送全量状态（静默模式）
              engine.manualPush(true, undefined, true);
            }
          }
        },
      );
    }

    logger.info("LLM Chat 同步引擎已初始化", {
      windowType: bus.windowType,
      states: Object.values(CHAT_STATE_KEYS),
      currentStreamingState: settings.value.uiPreferences.isStreaming,
    });

    isInitialized = true;
  }
  // 2. 操作代理：监听并处理来自子窗口的请求
  const handleActionRequest = (action: string, params: any): Promise<any> => {
    logger.info("收到操作请求", { action, params });
    switch (action) {
      case "send-message":
        return store.sendMessage(params.content, params.options);
      case "abort-sending":
        store.abortSending();
        return Promise.resolve();
      case "regenerate-from-node":
        return store.regenerateFromNode(params.nodeId, params.options);
      case "delete-message":
        return (store as any).deleteMessage(params.messageId);
      case "switch-sibling":
        return (store as any).switchToSiblingBranch(params.nodeId, params.direction);
      case "toggle-enabled":
        return (store as any).toggleNodeEnabled(params.nodeId);
      case "edit-message":
        return (store as any).editMessage(params.nodeId, params.newContent, params.attachments);
      case "create-branch":
        return (store as any).createBranch(params.nodeId);
      case "abort-node":
        store.abortNodeGeneration(params.nodeId);
        return Promise.resolve();
      case "update-agent":
        agentStore.updateAgent(params.agentId, params.updates);
        return Promise.resolve();
      case "update-user-profile":
        userProfileStore.updateProfile(params.profileId, params.updates);
        return Promise.resolve();
      case "update-chat-settings":
        const { updateSettings } = useChatSettings();
        return updateSettings(params.updates);
      case "switch-session":
        logger.info("主窗口处理 switch-session 请求", { sessionId: params.sessionId });
        return store.switchSession(params.sessionId).then(() => {
          logger.info("主窗口 switchSession 完成，当前 sessionId", {
            id: store.currentSessionId,
            hasDetail: store.sessionDetailMap.has(params.sessionId)
          });
        });
      case "delete-session":
        return store.deleteSession(params.sessionId);
      case "update-session":
        return store.updateSession(params.sessionId, params.updates);
      case "create-session":
        return store.createSession(params.agentId, params.name);
      case "select-agent":
        return (agentStore as any).selectAgent(params.agentId);
      case "complete-input":
        return (store as any).completeInput(params.content, params.options);
      case "analyze-context":
        store.contextAnalyzerNodeId = params.nodeId;
        store.contextAnalyzerVisible = true;
        return Promise.resolve();
      case "select-continuation-model":
        logger.info("主窗口收到续写模型选择请求，转发至 UI 命名空间");
        return bus.requestAction("llm-chat-ui:select-continuation-model", params);
      case "open-agent-settings":
        logger.info("主窗口收到打开智能体设置请求，转发至 UI 命名空间");
        return bus.requestAction("llm-chat-ui:open-agent-settings", params);
      case "open-quick-action-manager":
        logger.info("主窗口收到打开快捷操作管理请求，转发至 UI 命名空间");
        return bus.requestAction("llm-chat-ui:open-quick-action-manager", params);
      // 工具调用审批代理
      case "approve-tool-call":
        toolCallingStore.approveRequest(params.requestId);
        return Promise.resolve();
      case "reject-tool-call":
        toolCallingStore.rejectRequest(params.requestId);
        return Promise.resolve();
      case "approve-all-tool-calls":
        toolCallingStore.approveAll(params.sessionId);
        return Promise.resolve();
      case "reject-all-tool-calls":
        toolCallingStore.rejectAll(params.sessionId);
        return Promise.resolve();
      case "silent-approve-tool-call":
        toolCallingStore.silentApproveRequest(params.requestId);
        return Promise.resolve();
      case "silent-cancel-tool-call":
        toolCallingStore.silentCancelRequest(params.requestId);
        return Promise.resolve();
      case "silent-approve-all-tool-calls":
        toolCallingStore.silentApproveAll(params.sessionId);
        return Promise.resolve();
      case "silent-cancel-all-tool-calls":
        toolCallingStore.silentCancelAll(params.sessionId);
        return Promise.resolve();

      default:
        logger.warn("未知的操作请求", { action });
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  };

  if (bus.windowType === "main" || bus.windowType === "detached-tool") {
    bus.onActionRequest("llm-chat", handleActionRequest);
    logger.info("已注册操作请求处理器", { windowType: bus.windowType });

    // 动态初始化和清理同步引擎
    watch(
      bus.hasDownstreamWindows,
      (hasDownstream) => {
        if (hasDownstream) {
          logger.info("检测到下游窗口，初始化同步引擎");
          initialize();
        } else {
          logger.info("所有下游窗口已关闭，清理同步引擎");
          cleanupEngines();
        }
      },
      { immediate: true },
    );
  } else {
    logger.info("detached-component 窗口，不注册处理器（操作将代理至拥有数据的窗口）", { windowType: bus.windowType });
  }

  // detached-component 窗口需要主动请求初始状态
  if (bus.windowType === "detached-component") {
    setTimeout(() => {
      bus.requestInitialState();
    }, 100);
  }

  return {};
}
