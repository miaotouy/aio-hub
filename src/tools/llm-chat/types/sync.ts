/**
 * LLM Chat 窗口同步类型定义
 * 
 * 本文件定义了 LLM Chat 模块专用的状态同步类型，
 * 将业务逻辑从基础设施层分离出来。
 */

/**
 * LLM Chat 状态键枚举
 *
 * 定义了 LLM Chat 模块中所有可同步的状态类型
 *
 * 同步策略：
 * - AGENTS: 同步完整的智能体列表，让分离窗口能访问所有Agent
 * - CURRENT_AGENT_ID: 同步当前选中的智能体ID（全局）
 * - SESSIONS: 同步完整的会话列表（包括每个会话的完整消息树），让分离窗口能切换会话
 * - CURRENT_SESSION_ID: 同步当前激活的会话ID
 * - PARAMETERS: 同步运行时参数（如 isSending 状态）
 * - USER_PROFILES: 同步用户档案列表
 * - GLOBAL_PROFILE_ID: 同步全局用户档案ID
 */
export type LlmChatStateKey =
  | 'chat-agents'           // 智能体列表（完整）
  | 'chat-current-agent-id' // 当前选中的智能体ID（全局）
  | 'chat-sessions'         // 会话列表（完整，包含所有消息树）
  | 'chat-current-session-id'  // 当前会话ID
  | 'chat-parameters'       // 参数配置
  | 'chat-is-sending'       // 是否正在发送消息
  | 'chat-user-profiles'    // 用户档案列表（完整）
  | 'chat-global-profile-id' // 全局用户档案ID
  | 'chat-input-state';     // 输入框状态（文本内容）

/**
 * LLM Chat 状态键常量
 *
 * 提供类型安全的常量访问方式
 */
export const CHAT_STATE_KEYS = {
  AGENTS: 'chat-agents' as const,
  CURRENT_AGENT_ID: 'chat-current-agent-id' as const,
  SESSIONS: 'chat-sessions' as const,
  CURRENT_SESSION_ID: 'chat-current-session-id' as const,
  PARAMETERS: 'chat-parameters' as const,
  IS_SENDING: 'chat-is-sending' as const,
  USER_PROFILES: 'chat-user-profiles' as const,
  GLOBAL_PROFILE_ID: 'chat-global-profile-id' as const,
  INPUT_STATE: 'chat-input-state' as const,
} as const;

/**
 * LLM Chat 操作类型枚举
 *
 * 定义了 LLM Chat 模块中所有可代理的操作
 */
export type LlmChatAction =
  | 'send-message'
  | 'abort-sending'
  | 'regenerate-from-node'
  | 'delete-message'
  | 'switch-sibling'
  | 'toggle-enabled'
  | 'edit-message'
  | 'create-branch'
  | 'abort-node';

/**
 * LLM Chat 操作常量
 *
 * 提供类型安全的常量访问方式
 */
export const CHAT_ACTIONS = {
  SEND_MESSAGE: 'send-message' as const,
  ABORT_SENDING: 'abort-sending' as const,
  REGENERATE_FROM_NODE: 'regenerate-from-node' as const,
  DELETE_MESSAGE: 'delete-message' as const,
  SWITCH_SIBLING: 'switch-sibling' as const,
  TOGGLE_ENABLED: 'toggle-enabled' as const,
  EDIT_MESSAGE: 'edit-message' as const,
  CREATE_BRANCH: 'create-branch' as const,
  ABORT_NODE: 'abort-node' as const,
} as const;

/**
 * 创建 LLM Chat 同步配置的工厂函数
 *
 * @param stateKey 状态键
 * @returns 类型化的同步配置
 */
export function createChatSyncConfig<K extends LlmChatStateKey>(
  stateKey: K
) {
  return {
    stateKey,
    autoPush: true,
    autoReceive: true,
    enableDelta: true,
    deltaThreshold: 0.5,
    debounce: 100,
    requestOnMount: true, // 分离窗口启动时自动请求初始状态
  } as const;
}