import type { HistoryEntry } from "./history";
import type { LlmParameters } from "./llm";
import type { ChatMessageNode } from "./message";

/**
 * 聊天会话索引（轻量级，用于列表展示）
 */
export interface ChatSessionIndex {
  /**
   * 聊天会话的唯一标识符
   */
  id: string;

  /**
   * 会话的标题
   */
  name: string;

  /**
   * 用于 UI 展示的智能体 ID（当前活动路径最新助手消息所使用的智能体）
   */
  displayAgentId?: string | null;

  /**
   * 缓存的消息总数（排除根节点）
   * 用于列表展示性能优化
   */
  messageCount: number;

  /**
   * 会话创建和最后更新的时间戳
   */
  createdAt: string;
  updatedAt: string;
}

/**
 * 聊天会话详情（重量级，包含完整消息树和历史记录）
 */
export interface ChatSessionDetail {
  /**
   * 会话 ID，与索引中的 id 对应
   */
  id: string;

  /**
   * 存储会话中所有消息节点的字典，以节点ID为键
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
   * 会话级别的参数覆盖（可选）
   * 用于临时微调智能体的参数，不影响智能体本身的配置
   */
  parameterOverrides?: Partial<LlmParameters>;

  /**
   * 撤销/重做历史记录
   */
  history: HistoryEntry[];

  /**
   * 当前在历史记录中的索引
   */
  historyIndex: number;

  /**
   * 会话中智能体使用情况统计（可选，通常随详情加载）
   */
  agentUsage?: Record<string, number>;
}
