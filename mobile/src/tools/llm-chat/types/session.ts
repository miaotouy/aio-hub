import type { ChatMessageNode } from './message';

/**
 * 聊天会话
 */
export interface ChatSession {
  /**
   * 聊天会话的唯一标识符
   */
  id: string;

  /**
   * 存储会话中所有消息节点的字典
   */
  nodes: Record<string, ChatMessageNode>;

  /**
   * 根节点的ID
   */
  rootNodeId: string;

  /**
   * 当前活跃分支的叶节点ID
   */
  activeLeafId: string;

  /**
   * 会话的标题
   */
  name: string;

  /**
   * 会话创建和最后更新的时间戳
   */
  createdAt: string;
  updatedAt: string;
}