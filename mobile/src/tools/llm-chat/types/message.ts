import type { MessageRole, MessageStatus, MessageType } from './common';

/**
 * 消息节点（树形结构基础版）
 */
export interface ChatMessageNode {
  /**
   * 消息的唯一标识符
   */
  id: string;

  /**
   * 父消息节点的ID。根节点的 parentId 为 null。
   */
  parentId: string | null;

  /**
   * 子消息节点的ID列表。
   */
  childrenIds: string[];

  /**
   * 上次选择的子节点 ID（用于分支记忆）
   */
  lastSelectedChildId?: string;

  /**
   * 消息内容
   */
  content: string;

  /**
   * 消息作者的角色
   */
  role: MessageRole;

  /**
   * 消息的生成生命周期状态
   */
  status: MessageStatus;

  /**
   * 消息类型
   */
  type?: MessageType;

  /**
   * 消息创建的时间戳 (ISO 8601 格式)
   */
  timestamp?: string;

  /**
   * 附加元数据
   */
  metadata?: {
    /** 使用的模型 ID */
    modelId?: string;
    /** 使用的模型名称 */
    modelName?: string;
    /** 使用的模型显示名称 */
    modelDisplayName?: string;
    /** 错误信息 */
    error?: string;
    /** 推理内容（DeepSeek reasoning 模式） */
    reasoningContent?: string;
    /** 推理开始时间戳 */
    reasoningStartTime?: number;
    /** 推理结束时间戳 */
    reasoningEndTime?: number;
  };
}