import type { HistoryEntry } from './history';
import type { LlmParameters } from './llm';
import type { ChatMessageNode } from './message';

/**
 * 聊天会话（树形历史结构）
 *
 * 设计理念：会话与智能体完全解耦
 * - 智能体选择是全局的（存储在 agentStore 中）
 * - 每条消息的 metadata 记录生成时使用的智能体/模型
 * - 用户可以随时切换智能体，影响所有会话的后续消息
 * - 会话也可以临时覆盖智能体的参数（参数微调）
 */
export interface ChatSession {
  /**
   * 聊天会话的唯一标识符
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
   * 会话的标题
   */
  name: string;

  /**
   * 用于 UI 展示的智能体 ID（当前活动路径最新助手消息所使用的智能体）
   */
  displayAgentId?: string | null;

  /**
   * 会话中智能体使用情况统计
   */
  agentUsage?: Record<string, number>;

  /**
   * 会话级别的参数覆盖（可选）
   * 用于临时微调智能体的参数，不影响智能体本身的配置
   */
  parameterOverrides?: Partial<LlmParameters>;

  /**
   * 会话创建和最后更新的时间戳
   */
  createdAt: string;
  updatedAt: string;

  /**
   * 撤销/重做历史记录
   * @see UNDO_REDO_DESIGN.md
   */
  history?: HistoryEntry[];

  /**
   * 当前在历史记录中的索引
   */
  historyIndex?: number;
}