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
 */
export type LlmChatStateKey =
  | 'chat-messages'       // 聊天消息
  | 'chat-session'        // 会话信息
  | 'chat-agent'          // 智能体信息
  | 'chat-parameters';    // 参数配置

/**
 * LLM Chat 状态键常量
 * 
 * 提供类型安全的常量访问方式
 */
export const CHAT_STATE_KEYS = {
  MESSAGES: 'chat-messages' as const,
  SESSION: 'chat-session' as const,
  AGENT: 'chat-agent' as const,
  PARAMETERS: 'chat-parameters' as const,
} as const;

/**
 * LLM Chat 操作类型枚举
 * 
 * 定义了 LLM Chat 模块中所有可代理的操作
 */
export type LlmChatAction =
  | 'send-message'
  | 'abort-sending'
  | 'regenerate-last-message'
  | 'delete-message';

/**
 * LLM Chat 操作常量
 * 
 * 提供类型安全的常量访问方式
 */
export const CHAT_ACTIONS = {
  SEND_MESSAGE: 'send-message' as const,
  ABORT_SENDING: 'abort-sending' as const,
  REGENERATE_LAST_MESSAGE: 'regenerate-last-message' as const,
  DELETE_MESSAGE: 'delete-message' as const,
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
  } as const;
}