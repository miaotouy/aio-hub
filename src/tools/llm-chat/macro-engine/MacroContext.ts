/**
 * 宏上下文定义
 * 提供宏执行时需要的所有数据和状态
 */

import type { ChatSession, ChatAgent } from '../types';
import type { UserProfile } from '../types';

/**
 * 宏执行上下文
 * 包含所有宏可能需要访问的数据
 */
export interface MacroContext {
  /** 当前用户名称 */
  userName: string;
  /** 当前角色名称（智能体名称） */
  charName: string;
  /** 用户档案内容 */
  userProfile?: string;
  /** 智能体描述 */
  charDescription?: string;
  /** 智能体性格 */
  charPersonality?: string;
  /** 当前场景 */
  scenario?: string;
  /** 对话示例 */
  mesExamples?: string;
  /** 最后一条消息 */
  lastMessage?: string;
  /** 最后一条用户消息 */
  lastUserMessage?: string;
  /** 最后一条角色消息 */
  lastCharMessage?: string;
  /** 当前输入框内容 */
  input?: string;
  /** 局部变量存储（会话级别） */
  variables: Map<string, string | number>;
  /** 全局变量存储（应用级别） */
  globalVariables: Map<string, string | number>;
  /** 当前会话引用 */
  session?: ChatSession;
  /** 当前智能体引用 */
  agent?: ChatAgent;
  /** 当前用户档案引用 */
  userProfileObj?: UserProfile;
}

/**
 * 创建默认的宏上下文
 */
export function createMacroContext(options: {
  userName?: string;
  charName?: string;
  session?: ChatSession;
  agent?: ChatAgent;
  userProfile?: UserProfile;
}): MacroContext {
  return {
    userName: options.userName || 'User',
    charName: options.charName || 'Assistant',
    userProfile: options.userProfile?.content,
    charDescription: options.agent?.description,
    variables: new Map(),
    globalVariables: new Map(),
    session: options.session,
    agent: options.agent,
    userProfileObj: options.userProfile,
  };
}

/**
 * 从会话提取上下文信息
 */
export function extractContextFromSession(
  session: ChatSession,
  agent?: ChatAgent,
  userProfile?: UserProfile
): Partial<MacroContext> {
  // 从会话的活动路径中提取最后的消息
  const nodes = Object.values(session.nodes);
  const enabledNodes = nodes.filter(n => n.isEnabled !== false);
  
  const lastMessage = enabledNodes[enabledNodes.length - 1]?.content;
  const lastUserMessage = enabledNodes.filter(n => n.role === 'user').pop()?.content;
  const lastCharMessage = enabledNodes.filter(n => n.role === 'assistant').pop()?.content;

  return {
    lastMessage,
    lastUserMessage,
    lastCharMessage,
    session,
    agent,
    userProfileObj: userProfile,
    charDescription: agent?.description,
  };
}