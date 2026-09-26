import type { LlmMessageContent } from "@/tools/llm-api/types";
import type { ManagedAssetRef } from "../../asset-manager/types";

/**
 * 系统内置锚点/消息类型常量
 */
export const ANCHOR_IDS = {
  /** 历史消息占位符/锚点 */
  CHAT_HISTORY: "chat_history",
  /** 用户档案占位符/锚点 */
  USER_PROFILE: "user_profile",
} as const;

/**
 * Agent 私有附件引用（中间格式）。
 *
 * 预设消息的 `presetAttachments` 使用 `assetId` 引用 `AgentAsset.id`；
 * 开局消息的 `attachments`（桌面导出的完整 `Asset` 快照）通常提供 `path`。
 * 两者都不进入全局 `asset_manager.db`，运行时由
 * `preset-attachment-processor` 从 Agent 私有目录读取字节。
 */
export interface AgentAttachmentRef {
  /** 引用的 Agent 私有资产 Handle（`AgentAsset.id`）。 */
  assetId?: string;
  /** 相对 Agent 私有目录的路径，如 "assets/xxx.png"。 */
  path?: string;
  /** 原始文件名，用于按名称回退匹配。 */
  filename?: string;
  /** 用途描述（对齐桌面 `PresetAttachmentRef.description`）。 */
  description?: string;
  /** 已知 MIME（来自导入时的资产快照）。 */
  mimeType?: string;
  /** 已知资产类型提示（`AgentAsset.type` 或桌面 `Asset.type`）。 */
  type?: string;
  /** 无损保留原始引用字段，便于诊断与后续扩展。 */
  [key: string]: unknown;
}

/**
 * 统一的消息类型（用于管道处理）
 */
export interface ProcessableMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  /** 消息来源类型 */
  sourceType?:
    | "agent_preset"
    | "session_history"
    | "depth_injection"
    | "anchor_injection"
    | "worldbook_injection"
    | "unknown"
    | "merged";
  /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
  sourceId?: string | number;
  /** 在来源数组中的索引（用于精确匹配） */
  sourceIndex?: number;
  /** 用于存储被合并的原始消息 */
  _mergedSources?: ProcessableMessage[];
  /**
   * [中间格式] 暂存的附件列表
   * `attachment-preparer` 会先筛除失效引用、为已持久化的提取文本生成回退上下文；`useChatExecutor` 随后将可用引用序列化给 Rust 原生传输
   */
  _attachments?: ManagedAssetRef[];
  /**
   * [中间格式] Agent 私有附件引用（预设 `presetAttachments` 与开局消息 `attachments`）。
   * `preset-attachment-processor` 从 Agent 私有目录读取字节后，转换为可进入请求的
   * vision / 文本内容；处理完成后会被清空。
   */
  _privateAttachments?: AgentAttachmentRef[];
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
