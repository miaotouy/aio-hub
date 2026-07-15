import type { ChatMessageNode } from "@/tools/llm-chat/types";

export type AgentCategory = "assistant" | "character" | "expert" | "custom";

export interface LlmParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
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
  greetings?: unknown[];
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
