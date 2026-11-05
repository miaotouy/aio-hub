import type { ChatMessageNode } from "@/tools/llm-chat/types";

/** 与桌面端保持一致的智能体分类。 */
export enum AgentCategory {
  Assistant = "assistant",
  Character = "character",
  Expert = "expert",
  Creative = "creative",
  Workflow = "workflow",
  Other = "other",
}

/**
 * 将持久化数据中的旧分类归一化为当前桌面端枚举。
 * 未识别值保持未处理，由完整对象克隆与后续桌面端类型演进共同保留。
 */
export function normalizeAgentCategory(
  category: unknown
): AgentCategory | undefined {
  if (category === "custom") return AgentCategory.Other;
  return Object.values(AgentCategory).includes(category as AgentCategory)
    ? (category as AgentCategory)
    : undefined;
}

/**
 * 开局消息不参与预设上下文装配；创建会话时会被实体化为根节点的子分支。
 * 私有附件的可移植解析仍由 Agent 私有资产阶段负责。
 */
export interface GreetingMessage {
  id: string;
  name?: string;
  content: string;
  role: Extract<ChatMessageNode["role"], "assistant" | "user">;
  attachments?: unknown[];
  [key: string]: unknown;
}

export interface LlmParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  /** 请求前文本历史截断配置；附件与工具 schema 仍由独立估算处理。 */
  contextManagement?: {
    enabled?: boolean;
    maxContextTokens?: number;
    retainedCharacters?: number;
  };
  custom?: {
    enabled?: boolean;
    params?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/** 智能体私有资产类型，与桌面端 `AssetType` 对齐。 */
export type AgentAssetType = "image" | "audio" | "video" | "file";

/**
 * 智能体私有资产的移动端精简结构（对齐桌面 `AgentAsset` 子集）。
 * 二进制内容存于 `agents/{id}/` 私有目录，这里只保存相对路径与元数据；
 * 索引签名用于无损保留桌面端其余高级字段（description/group/options 等）。
 */
export interface AgentAsset {
  /** 智能体内稳定 Handle，用于宏替换。 */
  id: string;
  /** 原始文件名。 */
  filename: string;
  /** 相对 Agent 私有目录的路径，如 "assets/xxx.png"。 */
  path: string;
  type: AgentAssetType;
  /** 资产描述，宏摘要会一并输出（对齐桌面 `AgentAsset.description`）。 */
  description?: string;
  /** 归类到的分组 ID，指向 `AgentAssetGroup.id`；缺省视为未分组。 */
  group?: string;
  mimeType?: string;
  /** 文件大小（字节）。 */
  size?: number;
  [key: string]: unknown;
}

/**
 * 智能体私有资产分组元数据（对齐桌面 `AssetGroup` 精简字段）。
 * 只描述分组如何展示与排序，资产的归类由 `AgentAsset.group` 指向 `id`；
 * 索引签名用于无损保留桌面端其余高级字段。
 */
export interface AgentAssetGroup {
  /** 分组标识符，如 "emojis", "bgm", "scenes"。 */
  id: string;
  /** 分组显示名称，如 "表情包", "背景音乐"。 */
  displayName: string;
  /** 分组描述（供 LLM 理解用途）。 */
  description?: string;
  /** 分组图标（emoji 或图标路径）。 */
  icon?: string;
  /** 排序权重（数值越小越靠前）。 */
  sortOrder?: number;
  [key: string]: unknown;
}

/**
 * 归一化持久化数据中的资产分组，兼容旧版占位 `unknown[]`。
 * 仅保留具非空字符串 `id` 的对象项，丢弃非对象与缺 id 的项；
 * 合法项的其余字段（含桌面端未知字段）原样保留，`displayName` 缺失时回退为 `id`。
 */
export function normalizeAgentAssetGroups(value: unknown): AgentAssetGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: AgentAssetGroup[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;
    const displayName =
      typeof record.displayName === "string" && record.displayName.trim()
        ? record.displayName
        : id;
    groups.push({ ...record, id, displayName } as AgentAssetGroup);
  }
  return groups;
}

export interface AgentBaseConfig {
  version?: number;
  agentVersion?: string;
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  /** PNG character-card preview retained for the agent avatar. */
  avatarDataUrl?: string;
  presetMessages?: PresetMessage[];
  greetings?: GreetingMessage[];
  /** 默认选中的开局消息 ID；保留桌面端显式字段。 */
  defaultGreetingId?: string;
  displayPresetCount?: number;
  parameters?: LlmParameters;
  llmThinkRules?: unknown[];
  richTextStyleOptions?: unknown;
  defaultToolCallCollapsed?: boolean;
  virtualTimeConfig?: {
    virtualBaseTime: string;
    realBaseTime: string;
    timeScale?: number;
  };
  tags?: string[];
  category?: AgentCategory;
  regexConfig?: unknown;
  interactionConfig?: {
    sendButtonCreateBranch?: boolean;
    defaultMediaVolume?: number;
  };
  assetGroups?: AgentAssetGroup[];
  assets?: AgentAsset[];
  worldbookIds?: string[];
  quickActionSetIds?: string[];
  worldbookSettings?: unknown;
  knowledgeBaseConfig?: unknown;
  knowledgeSettings?: unknown;
  toolCallConfig?: unknown;
  extensionConfig?: unknown;
  visualGuideline?: string;
  variableConfig?: unknown;
  presetGroups?: PresetMessageGroup[];
  [key: string]: unknown;
}

/** 移动端可编辑字段；其余桌面端字段通过索引签名无损保留。 */
export interface PresetMessage extends ChatMessageNode {
  name?: string;
  groupId?: string;
  isEnabled?: boolean;
  injectionStrategy?: {
    type?: "default" | "depth" | "advanced_depth" | "anchor";
    depth?: number;
    depthConfig?: string;
    /** 占位锚点或 last_user / last_assistant / last_message 动态历史目标。 */
    anchorTarget?: string;
    anchorPosition?: "before" | "after";
    order?: number;
    [key: string]: unknown;
  };
  modelMatch?: {
    enabled: boolean;
    mode?: "any" | "all";
    exclude?: boolean;
    patterns: string[];
    profilePatterns?: string[];
    matchProfileName?: boolean;
    [key: string]: unknown;
  };
  presetAttachments?: Array<{
    assetId: string;
    description?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface PresetMessageGroup {
  id: string;
  name: string;
  description?: string;
  selectionMode: "checkbox" | "radio";
  enabled: boolean;
  [key: string]: unknown;
}

export interface ChatAgent extends AgentBaseConfig {
  id: string;
  avatarHistory?: string[];
  profileId: string;
  modelId: string;
  userProfileId?: string | null;
  createdAt: string;
  lastUsedAt?: string;
}

export interface AgentIndexItem {
  id: string;
  name: string;
  displayName?: string;
  agentVersion?: string;
  description?: string;
  icon?: string;
  profileId: string;
  modelId: string;
  lastUsedAt?: string;
  createdAt: string;
  category?: AgentCategory;
  tags?: string[];
}

export interface AgentsIndex {
  version: string;
  agents: AgentIndexItem[];
}
