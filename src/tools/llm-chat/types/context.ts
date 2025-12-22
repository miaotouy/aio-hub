import type { LlmMessageContent } from "@/llm-apis/common";
import type { LlmParameters } from "./llm";
import type { Asset, AssetMetadata } from "@/types/asset-management";
import type { ChatMessageNode, InjectionStrategy } from "./message";
import type { ChatSession } from './session';

/**
 * 系统内置锚点/消息类型常量
 * 这些常量同时用于 MessageType 判断和 InjectionStrategy.anchorTarget
 * 注意：这是锚点 ID 的常量对象，不是锚点定义数组
 */
export const ANCHOR_IDS = {
  /** 历史消息占位符/锚点 */
  CHAT_HISTORY: 'chat_history',
  /** 用户档案占位符/锚点 */
  USER_PROFILE: 'user_profile',
} as const;

/**
 * 统一的消息类型（用于管道处理）
 */
export interface ProcessableMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  /** 消息来源类型 */
  sourceType?: "agent_preset" | "session_history" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
  /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
  sourceId?: string | number;
  /** 在来源数组中的索引（用于精确匹配） */
  sourceIndex?: number;
  /** 用于存储被合并的原始消息 */
  _mergedSources?: ProcessableMessage[];
  /**
   * [中间格式] 暂存的附件列表
   * 在 asset-resolver 阶段会被处理并合并入 content
   */
  _attachments?: Asset[];
  /**
   * [元数据] 原始消息内容
   * 用于宏调试和差异对比，仅在宏处理发生时设置
   */
  _originalContent?: string;
  /** [元数据] 消息时间戳（宏还原用） */
  _timestamp?: number;
  /** [元数据] 用户名称快照（宏还原用） */
  _userName?: string;
  /** [元数据] 用户显示名称快照（宏还原用） */
  _userDisplayName?: string;
  /** [元数据] 用户头像快照（宏还原用） */
  _userIcon?: string;
}

/**
 * 带注入策略的消息包装器（用于内部处理）
 */
export interface InjectionMessage {
  message: ChatMessageNode;
  processedContent?: string;
  strategy: InjectionStrategy;
}

/**
 * LLM 上下文构建结果
 * 现在返回统一的消息列表，可包含 system, user, assistant 角色
 */
export interface LlmContextData {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | LlmMessageContent[];
    /** 消息来源类型 */
    sourceType?: "agent_preset" | "session_history" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
    /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
    sourceId?: string | number;
    /** 在来源数组中的索引（用于精确匹配） */
    sourceIndex?: number;
  }>;
  meta?: {
    sessionMessageCount: number;
    presetsBeforeCount?: number;
  };
}

/**
 * 上下文预览分析结果
 */
export interface ContextPreviewData {
  /** 预设消息部分（包含 system/user/assistant 等所有预设） */
  presetMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    originalContent?: string;
    charCount: number;
    tokenCount?: number;
    source: "agent_preset";
    index: number;
    /** 节点所使用的用户名称（快照） */
    userName?: string;
    /** 节点所使用的用户显示名称（快照） */
    userDisplayName?: string;
    /** 节点所使用的用户图标（快照） */
    userIcon?: string;
    /** 消息时间戳（宏还原用） */
    timestamp?: number;
  }>;
  /** 会话历史部分 */
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
    charCount: number;
    tokenCount?: number;
    source: "session_history";
    nodeId: string;
    index: number;
    /** 节点所使用的智能体名称（快照） */
    agentName?: string;
    /** 节点所使用的智能体显示名称（快照） */
    agentDisplayName?: string;
    /** 节点所使用的智能体图标（快照） */
    agentIcon?: string;
    /** 节点所使用的用户名称（快照） */
    userName?: string;
    /** 节点所使用的用户显示名称（快照） */
    userDisplayName?: string;
    /** 节点所使用的用户图标（快照） */
    userIcon?: string;
    /** 附件的详细分析 */
    attachments?: Array<{
      id: string;
      name: string;
      type: Asset["type"];
      path: string;
      importStatus?: Asset["importStatus"];
      originalPath?: string;
      size: number;
      tokenCount?: number;
      isEstimated: boolean;
      metadata?: AssetMetadata;
      error?: string;
    }>;
  }>;
  /** 最终构建的消息列表（用于原始请求展示） */
  finalMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string | LlmMessageContent[];
    /** 消息来源类型 */
    sourceType?: "agent_preset" | "session_history" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
    /** 用于存储被合并的原始消息 */
    _mergedSources?: any[];
    /** [中间格式] 暂存的附件列表 */
    _attachments?: Asset[];
    /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
    sourceId?: string | number;
    /** 在来源数组中的索引（用于精确匹配） */
    sourceIndex?: number;
  }>;
  /** 统计信息 */
  statistics: {
    totalCharCount: number;
    presetMessagesCharCount: number;
    chatHistoryCharCount: number;
    postProcessingCharCount?: number;
    messageCount: number;
    totalTokenCount?: number;
    presetMessagesTokenCount?: number;
    chatHistoryTokenCount?: number;
    postProcessingTokenCount?: number;
    isEstimated?: boolean;
    tokenizerName?: string;
    /** 历史消息被截断的条数 */
    truncatedMessageCount?: number;
    /** 通过截断节省的 Token 数 */
    savedTokenCount?: number;
    /** 通过截断节省的字符数 */
    savedCharCount?: number;
    /** 原始总字符数（截断前） */
    originalCharCount?: number;
  };
  /** Agent 信息 */
  agentInfo: {
    id: string;
    name?: string;
    displayName?: string;
    icon?: string;
    profileId: string;
    profileName?: string;
    providerType?: string;
    modelId: string;
    modelName?: string;
    virtualTimeConfig?: {
      virtualBaseTime: string;
      realBaseTime: string;
      timeScale?: number;
    };
  };
  /** LLM 请求参数 */
  parameters?: LlmParameters;
  /** 目标节点的时间戳（用于宏预览） */
  targetTimestamp?: number;
  /** 用户信息（用于宏预览） */
  userInfo?: {
    id?: string;
    name?: string;
    displayName?: string;
    icon?: string;
  };
  /** 完整的会话对象，用于宏调试等需要完整上下文的场景 */
  session?: ChatSession;
}