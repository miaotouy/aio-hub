import type { MessageRole, MessageStatus, MessageType } from "./common";
import type { ManagedAssetRef } from "../../asset-manager/types";

export type TokenCountSource = "api" | "local" | "fallback";
export type ContextRiskLevel = "normal" | "warning" | "critical";

export interface ContextTokenUsage {
  tokenCount: number;
  localTokenCount: number;
  contextLength?: number;
  usageRatio?: number;
  tokenizer?: string;
  estimated: boolean;
  source: TokenCountSource;
  riskLevel: ContextRiskLevel;
  warningRatio: number;
  criticalRatio: number;
}

export interface ChatMessageReference {
  /** 被回复消息的稳定 ID；源消息删除后仍保留快照用于展示。 */
  messageId: string;
  role: MessageRole;
  content: string;
  timestamp?: string;
}

export interface ChatMessageMetadata {
  /** Allow storage round-trips to preserve fields added by newer clients. */
  [key: string]: unknown;
  /** 用户输入所回复的消息快照。 */
  replyTo?: ChatMessageReference;
  /** 使用的模型 ID */
  modelId?: string;
  /** 生成该消息时绑定的智能体 ID */
  agentId?: string;
  /** 使用的模型名称 */
  modelName?: string;
  /** 使用的模型显示名称 */
  modelDisplayName?: string;
  /** 错误信息 */
  error?: string;
  /** 用户主动停止了本次生成；已有流式内容会被保留。 */
  interrupted?: boolean;
  /** 用户主动停止生成的时间戳。 */
  interruptedAt?: number;
  /** 此消息由助手消息的续写分支生成。 */
  isContinuation?: boolean;
  /** 续写分支创建时复制的助手回复前缀。 */
  continuationPrefix?: string;
  /** 推理内容（DeepSeek reasoning 模式） */
  reasoningContent?: string;
  /** 推理开始时间戳 */
  reasoningStartTime?: number;
  /** 推理结束时间戳 */
  reasoningEndTime?: number;
  /** Token 使用情况（API 返回的完整请求统计） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 单条消息内容的 Token 数量（本地计算） */
  contentTokens?: number;
  /** 单条消息 Token 的数据来源 */
  contentTokenSource?: TokenCountSource;
  /** 本地计算单条消息时使用的 tokenizer */
  contentTokenizer?: string;
  /** 生成本条助手消息时的完整请求上下文占用 */
  contextUsage?: ContextTokenUsage;
  /** 请求开始时间戳 */
  requestStartTime?: number;
  /** 请求结束时间戳 */
  requestEndTime?: number;
  /** 首字生成时间戳（用于计算 TTFT） */
  firstTokenTime?: number;
  /** 平均生成速度 (tokens/s) */
  tokensPerSecond?: number;
}

export interface ChatMessageAttachment extends ManagedAssetRef {
  id: string;
  createdAt?: string;
}

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
  metadata?: ChatMessageMetadata;

  /** 持久化到 llm_chat.db 的全局资产引用和轻量快照 */
  attachments?: ChatMessageAttachment[];
}
