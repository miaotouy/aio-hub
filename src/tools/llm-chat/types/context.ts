import type { LlmMessageContent } from "@/llm-apis/common";
import type { LlmParameters } from "./llm";
import type { Asset, AssetMetadata } from "@/types/asset-management";
import type { ChatMessageNode, InjectionStrategy } from "./message";

/**
 * 统一的消息类型（用于管道处理）
 */
export interface ProcessableMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  /** 消息来源类型 */
  sourceType?: "agent_preset" | "session_history" | "user_profile" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
  /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
  sourceId?: string | number;
  /** 在来源数组中的索引（用于精确匹配） */
  sourceIndex?: number;
  /** 用于存储被合并的原始消息 */
  _mergedSources?: ProcessableMessage[];
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
    sourceType?: "agent_preset" | "session_history" | "user_profile" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
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
    /** 节点所使用的用户图标（快照） */
    userIcon?: string;
    /** 是否为用户档案 */
    isUserProfile?: boolean;
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
    /** 节点所使用的智能体图标（快照） */
    agentIcon?: string;
    /** 节点所使用的用户名称（快照） */
    userName?: string;
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
    sourceType?: "agent_preset" | "session_history" | "user_profile" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
    /** 用于存储被合并的原始消息 */
    _mergedSources?: any[];
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
  };
  /** Agent 信息 */
  agentInfo: {
    id: string;
    name?: string;
    icon?: string;
    profileId: string;
    modelId: string;
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
}