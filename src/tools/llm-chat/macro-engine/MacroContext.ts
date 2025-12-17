/**
 * 宏上下文定义
 * 提供宏执行时需要的所有数据和状态
 */

import type { ChatSession, ChatAgent, ChatMessageNode } from '../types';
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
  /** 宏执行时的基准时间戳（可选，默认为当前时间） */
  timestamp?: number;

  // ==================== LLM 模型元数据 ====================
  /** 当前使用的完整模型 ID */
  modelId?: string;
  /** 当前使用的模型显示名称 */
  modelName?: string;
  /** 当前使用的 LLM 配置文件 ID */
  profileId?: string;
  /** 当前使用的 LLM 配置文件名称（用户定义的名称） */
  profileName?: string;
  /** 当前使用的模型提供商标识（从模型信息中获取） */
  providerType?: string;
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
  timestamp?: number;
  modelId?: string;
  modelName?: string;
  profileId?: string;
  profileName?: string;
  providerType?: string;
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
    timestamp: options.timestamp,
    modelId: options.modelId,
    modelName: options.modelName,
    profileId: options.profileId,
    profileName: options.profileName,
    providerType: options.providerType,
  };
}

/**
 * 从会话提取上下文信息
 * @param session - 会话对象
 * @param agent - 智能体对象
 * @param userProfile - 用户档案
 * @param targetNodeId - 目标节点 ID，如果提供，则从该节点开始回溯（用于调试/预览特定历史点）
 */
export function extractContextFromSession(
  session: ChatSession,
  agent?: ChatAgent,
  userProfile?: UserProfile,
  targetNodeId?: string
): Partial<MacroContext> {
  // 1. 获取目标路径（优先使用指定的 targetNodeId，否则使用当前活动叶子）
  const startNodeId = targetNodeId || session.activeLeafId;
  
  // 内部实现路径回溯，避免依赖 useNodeManager (Composable)
  const enabledNodes: ChatMessageNode[] = [];
  let currentId: string | null = startNodeId;
  const visited = new Set<string>(); // 防止循环引用导致的死循环

  while (currentId) {
    const node: ChatMessageNode | undefined = session.nodes[currentId];
    if (!node) break;

    if (visited.has(currentId)) break;
    visited.add(currentId);
    
    // 过滤掉根节点和禁用的节点
    if (node.id !== session.rootNodeId && node.isEnabled !== false) {
      enabledNodes.unshift(node);
    }
    
    currentId = node.parentId;
  }

  // 2. 提取消息
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