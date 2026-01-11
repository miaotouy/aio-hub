import type { LlmThinkRule, RichTextRendererStyleOptions } from '@/tools/rich-text-renderer/types';
import type { LlmParameters } from './llm';
import type { ChatMessageNode } from './message';

/**
 * 资产类型
 */
export type AssetType = 'image' | 'audio' | 'video' | 'file';

/**
 * 资产用途
 */
export type AssetUsage = 'inline' | 'background';

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
 * 智能体（Agent）- 包含完整的对话预设配置
 *
 * 智能体是模型、系统提示词、参数等配置的集合，
 * 用户可以创建多个预设智能体（如"编程助手"、"翻译专家"等），
 * 并在会话中快速切换
 */
export interface ChatAgent {
  /**
   * 智能体的唯一标识符
   */
  id: string;

  /**
   * 智能体名称（用作唯一标识符的一部分，也是宏替换的 ID）
   */
  name: string;

  /**
   * 显示名称（UI 显示优先使用，不影响宏替换）
   */
  displayName?: string;

  /**
   * 智能体描述（可选）
   */
  description?: string;

  /**
   * 智能体图标（emoji、图标路径或相对文件名）
   */
  icon?: string;

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
   * 预设消息序列
   *
   * 这是智能体的核心配置，用于构建对话的上下文基础。
   * 支持插入系统消息、用户示例、助手回答等，实现 Few-shot、角色扮演等高级功能。
   *
   * 特殊占位符：
   * - 可以包含一个特殊的 type='chat_history' 节点，标记【实际会话消息】的插入位置
   * - 如果没有占位符，则默认将实际会话追加在预设消息之后
   */
  presetMessages?: ChatMessageNode[];

  /**
   * 在聊天界面显示的预设消息数量
   *
   * 从 chat_history 占位符位置开始，向前倒数 N 条预设消息显示在聊天列表中。
   * 这些消息作为开场白展示，类似于角色卡的问候语。
   *
   * - 0 或 undefined: 不显示任何预设消息（默认）
   * - N > 0: 显示倒数 N 条预设消息
   *
   * 注意：只会显示 chat_history 占位符之前的 user/assistant 消息，不包括 system 消息
   */
  displayPresetCount?: number;

  /**
   * 参数配置
   */
  parameters: LlmParameters;

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
  regexConfig?: import('./chatRegex').ChatRegexConfig;

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
  };

  /**
   * 创建时间
   */
  createdAt: string;

  /**
   * 最后使用时间
   */
  lastUsedAt?: string;

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
   * 世界书覆盖设置
   */
  worldbookSettings?: {
    /** 是否禁用递归扫描 */
    disableRecursion?: boolean;
    /** 默认扫描深度 */
    defaultScanDepth?: number;
  };
}

/**
 * 智能体预设模板（从配置文件加载）
 *
 * 预设是一个智能体的模板，不包含具体的 profileId 和 modelId。
 * 用户在创建智能体时，可以从预设中选择一个作为起点，然后指定使用的模型。
 */
export interface AgentPreset {
  /**
   * 预设配置的版本号。
   *
   * 用于未来的迁移和兼容性检查。
   * 如果未指定，默认为 1。
   */
  version?: number;

  /**
   * 预设的唯一标识符（通常为文件名）
   */
  id: string;

  /**
   * 预设名称（显示在UI上）
   */
  name: string;

  /**
   * 显示名称（UI 显示优先使用）
   */
  displayName?: string;

  /**
   * 预设的简短描述
   */
  description: string;

  /**
   * 预设的图标（推荐使用 Emoji）
   */
  icon: string;

  /**
   * 预设消息序列
   * 通常包含系统提示词和示例对话
   */
  presetMessages: ChatMessageNode[];

  /**
   * 在聊天界面显示的预设消息数量
   * 从 chat_history 占位符位置开始，向前倒数 N 条预设消息显示在聊天列表中
   */
  displayPresetCount?: number;

  /**
   * 默认的模型参数
   */
  parameters: LlmParameters;

  /**
   * 分类标签（可选）
   * 用于在UI中进行分组和筛选
   */
  tags?: string[];

  /**
   * 预设分类（可选）
   * 用于在创建对话框中进行大类筛选（替代原有的 Tag 筛选）
   */
  category?: AgentCategory;

  /**
   * LLM 思考块规则配置
   */
  llmThinkRules?: LlmThinkRule[];

  /**
   * 富文本渲染器样式配置
   */
  richTextStyleOptions?: RichTextRendererStyleOptions;

  /**
   * 工具调用默认折叠
   */
  defaultToolCallCollapsed?: boolean;

  /**
   * 虚拟时间配置
   */
  virtualTimeConfig?: {
    virtualBaseTime: string;
    realBaseTime: string;
    timeScale?: number;
  };

  /**
   * 正则管道配置
   */
  regexConfig?: import('./chatRegex').ChatRegexConfig;

  /**
   * 交互行为配置
   */
  interactionConfig?: {
    sendButtonCreateBranch?: boolean;
  };

  /**
   * 智能体资产分组定义
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
   * 世界书覆盖设置
   */
  worldbookSettings?: {
    /** 是否禁用递归扫描 */
    disableRecursion?: boolean;
    /** 默认扫描深度 */
    defaultScanDepth?: number;
  };
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
  Assistant = 'assistant',   // 智能助手
  Character = 'character',   // 虚拟角色
  Expert = 'expert',         // 领域专家
  Creative = 'creative',     // 创意伙伴
  Workflow = 'workflow',     // 工作流
  Other = 'other'            // 其他
}

/**
 * 智能体分类显示名称映射
 */
export const AgentCategoryLabels: Record<AgentCategory, string> = {
  [AgentCategory.Assistant]: '智能助手',
  [AgentCategory.Character]: '虚拟角色',
  [AgentCategory.Expert]: '领域专家',
  [AgentCategory.Creative]: '创意伙伴',
  [AgentCategory.Workflow]: '工作流',
  [AgentCategory.Other]: '其他'
};