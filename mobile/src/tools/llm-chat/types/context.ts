import type { LlmMessageContent } from "@/tools/llm-api/types";

/**
 * 系统内置锚点/消息类型常量
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
  _attachments?: any[]; // 移动端暂未引入完整的 Asset 类型，先用 any
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
  /** [元数据] 消息名称（用于 UI 展示） */
  _name?: string;
}