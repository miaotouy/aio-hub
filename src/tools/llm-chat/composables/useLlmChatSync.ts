/**
 * LLM Chat 状态同步 Composable
 * 
 * 封装了 LlmChat.vue 与分离窗口之间的所有状态同步和操作代理逻辑
 */
import { toRef, type Ref } from 'vue';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { useUserProfileStore } from '../userProfileStore';
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
// 1. 状态定义 - 同步完整的 Store 状态，而不是衍生状态
// 这样分离窗口能获得完整的上下文，可以独立工作
// 注意：必须使用 toRef 而不是 computed，因为 computed 是只读的
const allAgents = toRef(agentStore, 'agents');
const allSessions = toRef(store, 'sessions');
const currentSessionId = toRef(store, 'currentSessionId');
const isSending = toRef(store, 'isSending');
const userProfiles = toRef(userProfileStore, 'profiles');
const globalProfileId = toRef(userProfileStore, 'globalProfileId');

  // 2. 状态同步引擎实例化
  const stateEngines: Array<{ manualPush: (isFullSync?: boolean, targetWindowLabel?: string, silent?: boolean) => Promise<void> }> = [];

  const createStateEngine = <T>(stateSource: Ref<T>, stateKey: LlmChatStateKey) => {
    const engine = useStateSyncEngine(stateSource, createChatSyncConfig(stateKey));
    stateEngines.push(engine);
  };

  // 同步完整的智能体列表
  createStateEngine(allAgents, CHAT_STATE_KEYS.AGENTS);
  // 同步当前选中的智能体ID（全局）
  createStateEngine(currentAgentId, CHAT_STATE_KEYS.CURRENT_AGENT_ID);
  // 同步完整的会话列表（包含所有消息树）
  createStateEngine(allSessions, CHAT_STATE_KEYS.SESSIONS);
  // 同步当前激活的会话ID
  createStateEngine(currentSessionId, CHAT_STATE_KEYS.CURRENT_SESSION_ID);
  // 同步发送状态
  createStateEngine(isSending, CHAT_STATE_KEYS.IS_SENDING);
  // 同步用户档案列表
  createStateEngine(userProfiles, CHAT_STATE_KEYS.USER_PROFILES);
  // 同步全局用户档案ID
  createStateEngine(globalProfileId, CHAT_STATE_KEYS.GLOBAL_PROFILE_ID);
  // 同步聊天设置（UI偏好、快捷键等）
  createStateEngine(settings, CHAT_STATE_KEYS.SETTINGS);

  logger.info('LLM Chat 同步引擎已初始化', {
    windowType: bus.windowType,
    stateCount: stateEngines.length,
    states: Object.values(CHAT_STATE_KEYS)
  });

  // 3. 操作代理：监听并处理来自子窗口的请求
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

  // 【关键修改】只在主窗口注册操作处理器
  // detached-tool 窗口不处理业务逻辑，它只是主窗口的"副本+中继站"
  // 所有操作请求都应该由主窗口处理，确保全局只有一个状态源
  if (bus.windowType === 'main') {
    bus.onActionRequest(handleActionRequest);
    logger.info('已注册操作请求处理器（仅主窗口）', { windowType: bus.windowType });

    // 4. 监听初始状态请求，按需推送全量状态
    bus.onInitialStateRequest((requesterLabel) => {
      logger.info(`收到来自 ${requesterLabel} 的初始状态请求，开始批量推送...`);
      for (const engine of stateEngines) {
        // 定向、强制推送全量状态给请求者（静默模式，避免日志刷屏）
        engine.manualPush(true, requesterLabel, true);
      }
      logger.info(`已向 ${requesterLabel} 批量推送所有初始状态`);
    });

    // 5. 监听重连事件，广播全量状态
    bus.onReconnect(() => {
      logger.info('主窗口重新获得焦点，开始向所有子窗口批量广播最新状态...');
      for (const engine of stateEngines) {
        engine.manualPush(true, undefined, true); // 广播全量状态（静默模式，避免日志刷屏）
      }
      logger.info('所有状态批量广播完成');
    });
  } else {
    logger.info('非主窗口，不注册操作处理器（所有操作将代理至主窗口）', { windowType: bus.windowType });
  }

  return {};
}