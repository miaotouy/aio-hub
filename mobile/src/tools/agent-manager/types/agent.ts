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

export interface AgentBaseConfig {
  version?: number;
  agentVersion?: string;
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
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
  assetGroups?: unknown[];
  assets?: unknown[];
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
