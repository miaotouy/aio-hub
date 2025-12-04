import type { Asset } from '@/types/asset-management';
import type { MessageRole, MessageStatus, MessageType } from './common';

/**
 * 消息节点（树形结构）
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
   * 子消息节点的ID列表。用于优化查询性能。
   */
  childrenIds: string[];

  /**
   * 记住上次选择的子节点ID
   * 当从其他分支切换回来时，可以恢复到上次查看的位置
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
   * 附加到此消息的文件资产列表
   */
  attachments?: Asset[];

  /**
   * 消息的生成生命周期状态
   */
  status: MessageStatus;

  /**
   * 核心状态：标记此节点是否处于激活状态。
   * - true (默认): 节点启用，其内容会参与上下文构建。
   * - false: 节点禁用，其内容在上下文构建时将被跳过。
   */
  isEnabled?: boolean;

  /**
   * 消息类型（可选，默认为 "message"）
   * - message: 普通预设消息
   * - chat_history: 历史消息占位符
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
    /** 生成此消息时使用的 Agent ID */
    agentId?: string;
    /** 生成此消息时使用的 Agent 名称（快照，防止 Agent 被删除后无法显示） */
    agentName?: string;
    /** 生成此消息时使用的 Agent 图标（快照，防止 Agent 被删除后无法显示） */
    agentIcon?: string;
    /** 生成此消息时使用的用户档案 ID */
    userProfileId?: string;
    /** 生成此消息时使用的用户档案名称（快照） */
    userProfileName?: string;
    /** 生成此消息时使用的用户档案图标（快照） */
    userProfileIcon?: string;
    /** 生成此消息时使用的 Profile ID */
    profileId?: string;
    /** 生成此消息时使用的模型 ID */
    modelId?: string;
    /** 使用的模型名称（显示用） */
    modelName?: string;
    /** 是否被截断 */
    isTruncated?: boolean;
    /** 错误信息 */
    error?: string;
    /** 如果这是一个摘要节点，记录它总结了哪些节点的ID */
    summarizedFrom?: string[];
    /** Token 使用情况（API 返回的完整请求统计） */
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    /**
     * 单条消息内容的 Token 数量（本地计算）
     * - 对于用户消息：本地计算的文本 + 附件 token 总数
     * - 对于助手消息：直接使用 API 返回的 completionTokens
     */
    contentTokens?: number;
    /** 本地计算的 Token 总数 */
    tokenCount?: number;
    /** Token 数是否为估算值 */
    tokenCountEstimated?: boolean;
    /** 推理内容（DeepSeek reasoning 模式） */
    reasoningContent?: string;
    /** 推理开始时间戳 */
    reasoningStartTime?: number;
    /** 推理结束时间戳 */
    reasoningEndTime?: number;
    /** 是否为预设消息的显示副本（用于 UI 区分） */
    isPresetDisplay?: boolean;
    /** 请求开始时间戳 */
    requestStartTime?: number;
    /** 请求结束时间戳 */
    requestEndTime?: number;
    /** 首字生成时间戳（用于计算 TTFT） */
    firstTokenTime?: number;
    /** 平均生成速度 (tokens/s) */
    tokensPerSecond?: number;
    /** 请求参数快照（记录生成此消息时实际使用的参数） */
    requestParameters?: Record<string, any>;
    /** 虚拟时间配置快照（记录生成此消息时使用的虚拟时间配置） */
    virtualTimeConfig?: {
      virtualBaseTime: string;
      realBaseTime: string;
      timeScale?: number;
    };
  };
}