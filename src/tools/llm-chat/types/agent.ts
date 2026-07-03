// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  LlmThinkRule,
  RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
import type { Asset } from "@/types/asset-management";
import type { LlmParameters } from "./llm";
import type { ChatMessageNode } from "./message";
import type { MessageRole } from "./common";
import type { VariableConfig } from "./sessionVariable";

/**
 * 资产类型
 */
export type AssetType = "image" | "audio" | "video" | "file";

/**
 * 资产用途
 */
export type AssetUsage = "inline" | "background";

/**
 * 资产附加选项
 */
export interface AssetOptions {
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** 视频封面图的 handle/id */
  coverId?: string;
  /** 场景定位或样式控制 */
  style?: string;
}

/**
 * 资产分组定义
 *
 * 用于组织 Agent 的资产，提供分组的元数据信息。
 * 分组信息可用于 UI 展示和宏注入时的上下文说明。
 */
export interface AssetGroup {
  /** 分组标识符，如 "emojis", "bgm", "scenes" */
  id: string;
  /** 分组显示名称，如 "表情包", "背景音乐" */
  displayName: string;
  /** 分组描述（供 LLM 理解用途），如 "角色的各种表情贴纸" */
  description?: string;
  /** 分组图标（emoji 或图标路径） */
  icon?: string;
  /** 排序权重（数值越小越靠前） */
  sortOrder?: number;
}

/**
 * 智能体专属资产定义
 */
export interface AgentAsset {
  /** 唯一标识符（Handle），用于宏替换，如 "sticker_ok" */
  id: string;
  /** 相对路径，如 "assets/xxx.png" */
  path: string;
  /** 原始文件名 */
  filename: string;
  /** 资产类型 */
  type: AssetType;
  /** 资产描述 */
  description?: string;
  /** 分组 */
  group?: string;
  /** 用途 */
  usage?: AssetUsage;
  /** 附加选项 */
  options?: AssetOptions;
  /** 文件大小（字节） */
  size?: number;
  /** MIME 类型 */
  mimeType?: string;
  /** 缩略图相对路径（如果有） */
  thumbnailPath?: string;
}

/**
 * 单个知识库的关联配置
 */
export interface AgentKnowledgeBaseBinding {
  /** 知识库 ID */
  kbId: string;
  /** 知识库名称 (冗余存储，用于显示和占位符匹配) */
  kbName: string;
  /** 是否启用 */
  enabled: boolean;
  /** 激活模式 (覆盖全局默认) */
  mode?: "always" | "gate" | "turn" | "static";
  /** 模式参数 */
  modeParams?: string[];
  /** 召回上限 (覆盖全局默认) */
  limit?: number;
  /** 最低分数阈值 (覆盖全局默认) */
  minScore?: number;
  /** 分组标识 (用于 UI 分组展示) */
  group?: string;
}

/**
 * 知识库分组定义
 */
export interface KnowledgeBaseGroup {
  id: string;
  displayName: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
}

/**
 * 知识库关联总配置
 */
export interface AgentKnowledgeBaseConfig {
  /** 全局开关 */
  enabled: boolean;
  /** 关联的知识库列表 */
  bindings: AgentKnowledgeBaseBinding[];
  /** 知识库分组 */
  groups?: KnowledgeBaseGroup[];
  /** 宏缺失时是否自动注入 */
  autoInjectIfMacroMissing?: boolean;
  /**
   * 自动注入的位置
   * - 'context_head': 上下文最前方（system 之后，若无 system 则为消息列表最前）
   * - 'before_last_user': 最后一条用户消息之前
   */
  autoInjectPosition?: "context_head" | "before_last_user";
}

export const DEFAULT_KB_CONFIG: AgentKnowledgeBaseConfig = {
  enabled: false,
  bindings: [],
  groups: [],
  autoInjectIfMacroMissing: true,
  autoInjectPosition: "context_head",
};

/**
 * 工具调用配置
 */
export interface ToolCallConfig {
  enabled: boolean;
  /**
   * 执行模式
   * auto: 开启全局自动批准（具体工具是否自动取决于 autoApproveTools）
   * manual: 全手动模式，所有工具调用均需批准
   */
  mode: "auto" | "manual";
  /** 工具启用状态 */
  toolToggles: Record<string, boolean>;
  /** 方法启用状态 (key: toolId_methodName) */
  methodToggles?: Record<string, boolean>;
  /** 允许自动批准的工具列表 */
  autoApproveTools: Record<string, boolean>;
  /** 方法自动批准状态 (key: toolId_methodName) */
  autoApproveMethods?: Record<string, boolean>;
  /** 新发现工具是否默认启用 */
  defaultToolEnabled: boolean;
  /** 新发现工具是否默认开启自动批准 */
  defaultAutoApprove: boolean;
  /** 是否显示方法统计 */
  showMethodsCount?: boolean;
  maxIterations: number;
  timeout: number;
  parallelExecution: boolean;
  protocol?: "vcp";
  /**
   * 将工具角色转换为用户角色
   * 开启后，在发送给 LLM 时，tool 角色的消息将被转换为 user 角色
   */
  convertToolRoleToUser?: boolean;
  /**
   * 每个工具的特定配置快照
   * key: toolId, value: 该工具的配置对象
   */
  toolSettings?: Record<string, any>;
  /**
   * 宏缺失时是否允许自动注入到历史记录之前
   * 开启后，如果预设消息中未找到 {{tools}} 宏，系统会自动将工具定义注入到 chat_history 锚点之前
   */
  autoInjectIfMacroMissing?: boolean;
  /**
   * 工具或方法的描述覆盖
   * key: toolId 或 toolId:methodName
   */
  overrides?: Record<
    string,
    {
      enabled: boolean;
      displayName?: string;
      description?: string;
      example?: string;
    }
  >;
  /** 是否在结束时速率限制 */
  rateLimitEnabled?: boolean;
  /** API 请求频率限制（秒） */
  rateLimitInterval?: number;
}
/**
 * Agent 扩展配置
 */
export interface AgentExtensionConfig {
  enabled: boolean;
  /** 扩展插件启用状态 (key: extensionId) */
  extensionToggles: Record<string, boolean>;
  /** 新发现扩展是否默认启用 */
  defaultExtensionEnabled: boolean;
}

export const DEFAULT_AGENT_EXTENSION_CONFIG: AgentExtensionConfig = {
  enabled: true,
  extensionToggles: {},
  defaultExtensionEnabled: true,
};

/**
 * 开局消息定义
 *
 * 不参与 presetMessages 上下文装配；创建会话时会被实例化为真实消息树节点。
 */
export interface GreetingMessage {
  /** 唯一标识，用于追踪同步来源 */
  id: string;
  /** UI 显示名称 */
  name?: string;
  /** 消息内容，创建/同步到会话时会执行宏展开 */
  content: string;
  /** 消息角色，通常为 assistant */
  role: Extract<MessageRole, "assistant" | "user">;
  /** 附件 */
  attachments?: Asset[];
}

export const DEFAULT_TOOL_CALL_CONFIG: ToolCallConfig = {
  enabled: false,
  mode: "auto",
  toolToggles: {},
  methodToggles: {},
  autoApproveTools: {},
  autoApproveMethods: {},
  defaultToolEnabled: false,
  defaultAutoApprove: false,
  showMethodsCount: true,
  maxIterations: 20,
  timeout: 30000,
  parallelExecution: false,
  protocol: "vcp",
  convertToolRoleToUser: true,
  toolSettings: {},
  autoInjectIfMacroMissing: false,
  overrides: {},
  rateLimitEnabled: false,
  rateLimitInterval: 0,
};

/**
 * 智能体知识库设置
 *
 * 本项目的知识库模块是"条目式记忆系统"，不是文档分片 RAG。
 */
export interface AgentKnowledgeSettings {
  /** 默认检索引擎 ID (vector | keyword | blender) */
  defaultEngineId?: string;

  /**
   * 召回上限 (1-50)
   * 这是一个上限，实际截断以 minScore 为准。
   * 即使设为 50，如果只有 3 条超过分数阈值，就只返回 3 条。
   */
  defaultLimit?: number;

  /** 召回总字数上限 (0表示不限制，超出则丢弃) */
  maxRecallChars?: number;

  /**
   * 最低相关度分数 (0.0-1.0)
   * 低于此分数的条目直接丢弃，不会被召回。
   * 这是实际的截断依据，比 limit 更重要。
   */
  defaultMinScore?: number;

  /** 检索结果的格式化模板 (支持变量: {count}, {kbName}, {key}, {content}, {score}, {tags}) */
  resultTemplate?: string;

  /** 无结果时的占位文本 */
  emptyText?: string;

  /** 标签门控 (gate) 模式默认扫描消息深度 */
  gateScanDepth?: number;

  /**
   * 查询上下文窗口（轮数）
   * @deprecated 已废弃。检索机制已重构，被动召回现在固定以最近一对 AI/User 消息作为检索查询
   * （且严格排除 tool 消息），不再支持多轮窗口配置。保留此字段仅用于旧数据加载兼容。
   */
  contextWindow?: number;

  /**
   * 是否启用检索结果缓存
   * 缓存策略：精确文本匹配，完全一致才命中。
   */
  enableCache?: boolean;
}

/**
 * 旧版 aggregation 子对象类型（仅用于数据迁移）
 * @deprecated 已废弃，字段已提升到 AgentKnowledgeSettings 顶层
 */
export interface _LegacyAggregationConfig {
  contextWindow?: number;
  queryDecay?: number;
  enableCache?: boolean;
  cacheSimilarityThreshold?: number;
  enableResultAggregation?: boolean;
  resultDecay?: number;
  maxHistoryTurns?: number;
}

export type PresetGroupSelectionMode = "checkbox" | "radio";

export interface PresetMessageGroup {
  /** 组的唯一标识符 */
  id: string;
  /** 组显示名称，如 "说话风格"、"当前场景" */
  name: string;
  /** 组描述（可选） */
  description?: string;
  /**
   * 选择模式
   * - checkbox: 多选，组内消息独立启用/禁用（默认）
   * - radio: 单选，组内同时最多只能有一条消息启用
   */
  selectionMode: PresetGroupSelectionMode;
  /**
   * 组整体开关
   * - true（默认）: 组启用
   * - false: 组禁用，组内所有消息不参与上下文构建
   */
  enabled: boolean;
}

/**
 * 智能体共有配置基础接口
 * 包含模板和实例都会使用的核心字段
 */
export interface AgentBaseConfig {
  /**
   * 预设配置的版本号（格式版本）。
   * 用于未来的迁移和兼容性检查。
   * 如果未指定，默认为 2。
   */
  version?: number;

  /**
   * 智能体自身的版本号
   * 用于用户识别和升级对比
   */
  agentVersion?: string;

  /**
   * 智能体名称（用作唯一标识符的一部分，也是宏替换的 ID）
   */
  name: string;

  /**
   * 显示名称（UI 显示优先使用，不影响宏替换）
   */
  displayName?: string;

  /**
   * 智能体描述
   */
  description?: string;

  /**
   * 智能体图标（emoji、图标路径或相对文件名）
   */
  icon?: string;

  /**
   * 预设消息序列
   *
   * 这是智能体的核心配置，用于构建对话的上下文基础。
   * 支持插入系统消息、用户示例、助手回答等，实现 Few-shot、角色扮演等高级功能。
   */
  presetMessages?: ChatMessageNode[];

  /**
   * 开局消息列表
   *
   * 独立于 presetMessages。创建会话时作为 root 的真实子节点插入，
   * 多个开局天然形成兄弟分支。
   */
  greetings?: GreetingMessage[];

  /**
   * 在聊天界面显示的预设消息数量
   *
   * 从 chat_history 占位符位置开始，向前倒数 N 条预设消息显示在聊天列表中。
   * 这些消息作为开场白展示，类似于角色卡的问候语。
   */
  displayPresetCount?: number;

  /**
   * 参数配置
   * 按需加载模式下，详情加载前为 undefined
   */
  parameters?: LlmParameters;

  /**
   * LLM 思考块规则配置
   * 用于识别和渲染 LLM 输出中的思考过程（如 Chain of Thought）
   */
  llmThinkRules?: LlmThinkRule[];

  /**
   * 富文本渲染器样式配置
   * 用于自定义该智能体回复的 Markdown 样式
   */
  richTextStyleOptions?: RichTextRendererStyleOptions;

  /**
   * 工具调用默认折叠
   */
  defaultToolCallCollapsed?: boolean;

  /**
   * 虚拟时间配置
   * 用于设定智能体的虚拟时间流逝规则
   */
  virtualTimeConfig?: {
    /** 虚拟基准时间 (ISO 8601) */
    virtualBaseTime: string;
    /** 现实基准时间 (ISO 8601) */
    realBaseTime: string;
    /** 时间流速倍率 (默认为 1.0) */
    timeScale?: number;
  };

  /**
   * 筛选标签
   * 用于在UI中进行分组和筛选
   */
  tags?: string[];

  /**
   * 智能体分类
   * 使用预定义的枚举类型，不支持自定义
   */
  category?: AgentCategory;

  /**
   * 正则管道配置
   * 用于对消息内容进行动态清洗、格式转换等
   */
  regexConfig?: import("./chatRegex").ChatRegexConfig;

  /**
   * 交互行为配置
   */
  interactionConfig?: {
    /**
     * 按钮点击发送时是否创建新分支
     * true: 创建新分支
     * false/undefined: 追加到当前对话末尾
     */
    sendButtonCreateBranch?: boolean;
    /**
     * 默认媒体音量 (0-100)
     * 用于调节该智能体输出音频的初始音量权重
     */
    defaultMediaVolume?: number;
  };

  /**
   * 智能体资产分组定义
   * 定义资产的分组元数据，如显示名称、描述等
   */
  assetGroups?: AssetGroup[];

  /**
   * 智能体专属资产
   */
  assets?: AgentAsset[];

  /**
   * 关联的世界书 ID 列表
   */
  worldbookIds?: string[];

  /**
   * 关联的快捷操作组 ID 列表
   */
  quickActionSetIds?: string[];

  /**
   * 世界书覆盖设置
   */
  worldbookSettings?: {
    /** 是否禁用递归扫描 */
    disableRecursion?: boolean;
    /** 默认扫描深度 */
    defaultScanDepth?: number;
  };

  /** 知识库关联配置 */
  knowledgeBaseConfig?: AgentKnowledgeBaseConfig;

  /** 知识库全局设置 (检索参数) */
  knowledgeSettings?: AgentKnowledgeSettings;

  /** 工具调用配置 */
  toolCallConfig?: ToolCallConfig;

  /** 环境增强配置 */
  extensionConfig?: AgentExtensionConfig;

  /**
   * 视觉化输出指南
   * 用于指导 LLM 如何使用 HTML/CSS/JS 进行视觉化输出
   */
  visualGuideline?: string;

  /** 会话变量配置 */
  variableConfig?: VariableConfig;

  /** 预设消息组定义 */
  presetGroups?: PresetMessageGroup[];
}

/**
 * 智能体（Agent）- 包含完整的对话预设配置
 *
 * 智能体是模型、系统提示词、参数等配置的集合，
 * 用户可以创建多个预设智能体（如"编程助手"、"翻译专家"等），
 * 并在会话中快速切换
 */
export interface ChatAgent extends AgentBaseConfig {
  /**
   * 智能体的唯一标识符 (运行时生成的 UUID)
   */
  id: string;

  /**
   * 历史头像列表（相对文件名）
   * 用于在头像选择器中快速显示，由系统自动维护
   */
  avatarHistory?: string[];

  /**
   * 使用的 Profile ID
   */
  profileId: string;

  /**
   * 使用的模型 ID
   */
  modelId: string;

  /**
   * 绑定的用户档案 ID（可选）
   * 如果设置，则覆盖全局默认的用户档案
   */
  userProfileId?: string | null;

  /**
   * 创建时间
   */
  createdAt: string;

  /**
   * 最后使用时间
   */
  lastUsedAt?: string;
}

/**
 * 智能体预设模板（从配置文件加载）
 *
 * 预设是一个智能体的模板，不包含具体的 profileId 和 modelId。
 * 用户在创建智能体时，可以从预设中选择一个作为起点，然后指定使用的模型。
 */
export interface AgentPreset extends AgentBaseConfig {
  /**
   * 预设的唯一标识符（通常为文件名，如 "translator"）
   */
  id: string;

  /**
   * 预设的简短描述（在模板中通常是必填的）
   */
  description: string;

  /**
   * 预设的图标（推荐使用 Emoji）
   */
  icon: string;

  /**
   * 预设消息序列（在模板中通常是必填的）
   */
  presetMessages: ChatMessageNode[];
}

/**
 * 智能体编辑/创建数据
 * 剔除系统生成的只读字段
 */
export type AgentEditData = Omit<ChatAgent, "id" | "createdAt" | "lastUsedAt">;

/**
 * 智能体分类枚举
 */
export enum AgentCategory {
  Assistant = "assistant", // 智能助手
  Character = "character", // 虚拟角色
  Expert = "expert", // 领域专家
  Creative = "creative", // 创意伙伴
  Workflow = "workflow", // 工作流
  Other = "other", // 其他
}

/**
 * 智能体分类显示名称映射
 */
export const AgentCategoryLabels: Record<AgentCategory, string> = {
  [AgentCategory.Assistant]: "智能助手",
  [AgentCategory.Character]: "虚拟角色",
  [AgentCategory.Expert]: "领域专家",
  [AgentCategory.Creative]: "创意伙伴",
  [AgentCategory.Workflow]: "工作流",
  [AgentCategory.Other]: "其他",
};
