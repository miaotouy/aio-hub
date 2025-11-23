/**
 * LLM Chat 状态同步 Composable
 * 
 * 封装了 LlmChat.vue 与分离窗口之间的所有状态同步和操作代理逻辑
 */
import { toRef, type Ref, watch, computed, onUnmounted } from 'vue';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { useUserProfileStore } from '../userProfileStore';
import { useDetachedManager } from '@/composables/useDetachedManager';
import { useLlmChatUiState } from './useLlmChatUiState';
import { useChatSettings } from './useChatSettings';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';
import { createModuleLogger } from '@/utils/logger';
import type { LlmChatStateKey } from '../types/sync';
import { CHAT_STATE_KEYS, createChatSyncConfig } from '../types/sync';

const logger = createModuleLogger('LlmChatSync');

export function useLlmChatSync() {
  const store = useLlmChatStore();
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const { currentAgentId } = useLlmChatUiState();
  const { settings } = useChatSettings();
  const bus = useWindowSyncBus();

  // 状态同步引擎实例化（延迟初始化）
  let isInitialized = false;
  // 收集所有状态同步引擎实例，用于批量操作
  const stateEngines: ReturnType<typeof useStateSyncEngine>[] = [];

  // 在组件卸载时手动清理所有异步创建的引擎
  // 必须在 setup 期间注册，而不是在 initialize (可能异步) 中注册
  onUnmounted(() => {
    if (stateEngines.length > 0) {
      logger.info('组件卸载，清理所有同步引擎', { count: stateEngines.length });
      stateEngines.forEach(engine => engine.cleanup());
      stateEngines.length = 0;
    }
  });

  /**
   * 初始化同步引擎
   * 必须在数据加载完成后调用
   */
  function initialize() {
    if (isInitialized) {
      logger.warn('同步引擎已初始化，跳过重复初始化');
      return;
    }

    // 1. 状态定义 - 同步完整的 Store 状态，而不是衍生状态
    // 这样分离窗口能获得完整的上下文，可以独立工作
    // 注意：必须使用 toRef 而不是 computed，因为 computed 是只读的
    const allAgents = toRef(agentStore, 'agents');
    const allSessions = toRef(store, 'sessions');
    // 使用 computed 获取当前会话对象，用于单独同步
    // 注意：因为 computed 是只读的，在接收端(子窗口)不能直接绑定到这个 computed
    // 但在发送端(主窗口)，我们可以把它作为源
    const currentSessionData = computed(() => store.currentSession);
    const currentSessionId = toRef(store, 'currentSessionId');
    const isSending = toRef(store, 'isSending');
    // 将 generatingNodes Set 转换为数组进行同步
    const generatingNodesArray = computed(() => Array.from(store.generatingNodes));
    const userProfiles = toRef(userProfileStore, 'profiles');
    const globalProfileId = toRef(userProfileStore, 'globalProfileId');

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
    // 同步完整的会话列表（包含所有消息树）
    createStateEngine(allSessions, CHAT_STATE_KEYS.SESSIONS);
    // 同步当前会话的完整数据（作为独立通道，供轻量级消费者使用）
    // 注意：这里我们传递 computed ref，useStateSyncEngine 会将其视为只读源进行发送
    createStateEngine(currentSessionData as any, CHAT_STATE_KEYS.CURRENT_SESSION_DATA);
    // 同步当前激活的会话ID
    createStateEngine(currentSessionId, CHAT_STATE_KEYS.CURRENT_SESSION_ID);
    // 同步发送状态
    createStateEngine(isSending, CHAT_STATE_KEYS.IS_SENDING);
    // 同步正在生成的节点列表
    createStateEngine(generatingNodesArray as any, CHAT_STATE_KEYS.GENERATING_NODES);
    // 同步用户档案列表
    createStateEngine(userProfiles, CHAT_STATE_KEYS.USER_PROFILES);
    // 同步全局用户档案ID
    createStateEngine(globalProfileId, CHAT_STATE_KEYS.GLOBAL_PROFILE_ID);
    // 同步聊天设置（UI偏好、快捷键等）
    createStateEngine(settings, CHAT_STATE_KEYS.SETTINGS);

    // 【重要】在非主窗口中，监听同步过来的 settings 变化
    // 因为 settings 是单例 ref，同步引擎会更新它的值，我们需要确保UI能响应这个变化
    if (bus.windowType !== 'main') {
      watch(settings, (newSettings) => {
        logger.info('分离窗口接收到设置同步', {
          isStreaming: newSettings.uiPreferences.isStreaming,
          windowType: bus.windowType
        });
      }, { deep: true, immediate: true });
    }

    // 当组件被重新附加时，强制进行一次全量状态广播
    // 这确保了父窗口（main 或 detached-tool）的UI能够反映
    // 子窗口（detached-component）中可能发生的最后状态变化
    if (bus.windowType === 'main' || bus.windowType === 'detached-tool') {
      const detachedManager = useDetachedManager();
      watch(
        () => detachedManager.detachedComponents.value.length,
        (newLength, oldLength) => {
          // 只有当组件数量减少时，才认为是“还原”操作
          if (typeof oldLength === 'number' && newLength < oldLength) {
            logger.info('检测到组件重新附着，强制进行全量状态广播', {
              windowType: bus.windowType,
              newLength,
              oldLength,
            });
            for (const engine of stateEngines) {
              // 强制推送全量状态（静默模式）
              engine.manualPush(true, undefined, true);
            }
          }
        }
      );
    }

    logger.info('LLM Chat 同步引擎已初始化', {
      windowType: bus.windowType,
      states: Object.values(CHAT_STATE_KEYS),
      currentStreamingState: settings.value.uiPreferences.isStreaming
    });

    isInitialized = true;
  }
  // 2. 操作代理：监听并处理来自子窗口的请求
  const handleActionRequest = (action: string, params: any): Promise<any> => {
    logger.info('收到操作请求', { action, params });
    switch (action) {
      case 'send-message':
        // 不要 await，立即返回，防止请求超时
        store.sendMessage(params.content, params.attachments);
        return Promise.resolve();
      case 'abort-sending':
        store.abortSending();
        return Promise.resolve();
      case 'regenerate-from-node':
        // 不要 await，立即返回，防止请求超时
        store.regenerateFromNode(params.messageId);
        return Promise.resolve();
      case 'delete-message':
        store.deleteMessage(params.messageId);
        return Promise.resolve();
      case 'switch-sibling':
        store.switchToSiblingBranch(params.nodeId, params.direction);
        return Promise.resolve();
      case 'toggle-enabled':
        store.toggleNodeEnabled(params.nodeId);
        return Promise.resolve();
      case 'edit-message':
        store.editMessage(params.nodeId, params.newContent, params.attachments);
        return Promise.resolve();
      case 'create-branch':
        store.createBranch(params.nodeId);
        return Promise.resolve();
      case 'abort-node':
        store.abortNodeGeneration(params.nodeId);
        return Promise.resolve();
      default:
        logger.warn('未知的操作请求', { action });
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  };

  // 【关键修改】main 窗口和 detached-tool 窗口都注册处理器
  // detached-tool 是 LlmChat 的完整副本，拥有完整数据，应该能响应子组件的请求
  // detached-component 窗口（如分离的 ChatArea）不注册，它们通过代理发送请求
  if (bus.windowType === 'main' || bus.windowType === 'detached-tool') {
    bus.onActionRequest(handleActionRequest);
    logger.info('已注册操作请求处理器', { windowType: bus.windowType });
    
    // 注意：初始状态请求和重连广播现已由 useStateSyncEngine 的全局注册中心自动处理
    // 无需在此处手动维护
  } else {
    logger.info('detached-component 窗口，不注册处理器（操作将代理至拥有数据的窗口）', { windowType: bus.windowType });
  }

  return {
    initialize,
  };
}