/**
 * LLM Chat 模块的类型定义
 */

import type { Asset } from '@/types/asset-management';
import type { LlmThinkRule } from '@/tools/rich-text-renderer/types';

/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * 消息生成状态
 */
export type MessageStatus = "generating" | "complete" | "error";

/**
 * 消息类型
 * - message: 普通消息
 * - chat_history: 历史消息占位符（用于标记实际会话消息的插入位置）
 * - user_profile: 用户档案占位符（用于标记用户档案内容的插入位置）
 */
export type MessageType = "message" | "chat_history" | "user_profile";

/**
 * 头像模式
 * - path: icon 字段是一个完整的路径或 emoji
 * - builtin: icon 字段是内置于 Agent/Profile 目录下的相对文件名
 */
export type IconMode = "path" | "builtin";

/**
 * 消息节点（树形结构）
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
   * 子消息节点的ID列表。用于优化查询性能。
   */
  childrenIds: string[];

  /**
   * 记住上次选择的子节点ID
   * 当从其他分支切换回来时，可以恢复到上次查看的位置
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
   * 附加到此消息的文件资产列表
   */
  attachments?: Asset[];

  /**
   * 消息的生成生命周期状态
   */
  status: MessageStatus;

  /**
   * 核心状态：标记此节点是否处于激活状态。
   * - true (默认): 节点启用，其内容会参与上下文构建。
   * - false: 节点禁用，其内容在上下文构建时将被跳过。
   */
  isEnabled?: boolean;

  /**
   * 消息类型（可选，默认为 "message"）
   * - message: 普通预设消息
   * - chat_history: 历史消息占位符
   */
  type?: MessageType;

  /**
   * 消息创建的时间戳 (ISO 8601 格式)
   */
  timestamp: string;

  /**
   * 附加元数据
   */
  metadata?: {
    /** 生成此消息时使用的 Agent ID */
    agentId?: string;
    /** 生成此消息时使用的 Agent 名称（快照，防止 Agent 被删除后无法显示） */
    agentName?: string;
    /** 生成此消息时使用的 Agent 图标（快照，防止 Agent 被删除后无法显示） */
    agentIcon?: string;
    /** Agent 图标模式快照 */
    agentIconMode?: IconMode;
    /** 生成此消息时使用的用户档案 ID */
    userProfileId?: string;
    /** 生成此消息时使用的用户档案名称（快照） */
    userProfileName?: string;
    /** 生成此消息时使用的用户档案图标（快照） */
    userProfileIcon?: string;
    /** 用户档案图标模式快照 */
    userProfileIconMode?: IconMode;
    /** 生成此消息时使用的 Profile ID */
    profileId?: string;
    /** 生成此消息时使用的模型 ID */
    modelId?: string;
    /** 使用的模型名称（显示用） */
    modelName?: string;
    /** 是否被截断 */
    isTruncated?: boolean;
    /** 错误信息 */
    error?: string;
    /** 如果这是一个摘要节点，记录它总结了哪些节点的ID */
    summarizedFrom?: string[];
    /** Token 使用情况（API 返回的完整请求统计） */
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    /**
     * 单条消息内容的 Token 数量（本地计算）
     * - 对于用户消息：本地计算的文本 + 附件 token 总数
     * - 对于助手消息：直接使用 API 返回的 completionTokens
     */
    contentTokens?: number;
    /** 本地计算的 Token 总数 */
    tokenCount?: number;
    /** Token 数是否为估算值 */
    tokenCountEstimated?: boolean;
    /** 推理内容（DeepSeek reasoning 模式） */
    reasoningContent?: string;
    /** 推理开始时间戳 */
    reasoningStartTime?: number;
    /** 推理结束时间戳 */
    reasoningEndTime?: number;
    /** 是否为预设消息的显示副本（用于 UI 区分） */
    isPresetDisplay?: boolean;
  };
}

/**
 * 聊天会话（树形历史结构）
 *
 * 设计理念：会话与智能体完全解耦
 * - 智能体选择是全局的（存储在 agentStore 中）
 * - 每条消息的 metadata 记录生成时使用的智能体/模型
 * - 用户可以随时切换智能体，影响所有会话的后续消息
 * - 会话也可以临时覆盖智能体的参数（参数微调）
 */
export interface ChatSession {
  /**
   * 聊天会话的唯一标识符
   */
  id: string;

  /**
   * 存储会话中所有消息节点的字典，以节点ID为键
   */
  nodes: Record<string, ChatMessageNode>;

  /**
   * 根节点的ID
   */
  rootNodeId: string;

  /**
   * 当前活跃分支的叶节点ID
   */
  activeLeafId: string;

  /**
   * 会话的标题
   */
  name: string;

  /**
   * 用于 UI 展示的智能体 ID（当前活动路径最新助手消息所使用的智能体）
   */
  displayAgentId?: string | null;

  /**
   * 会话中智能体使用情况统计
   */
  agentUsage?: Record<string, number>;

  /**
   * 会话级别的参数覆盖（可选）
   * 用于临时微调智能体的参数，不影响智能体本身的配置
   */
  parameterOverrides?: Partial<LlmParameters>;

  /**
   * 会话创建和最后更新的时间戳
   */
  createdAt: string;
  updatedAt: string;
}

/**
 * 上下文后处理规则
 */
export interface ContextPostProcessRule {
  /** 规则类型 */
  type:
    | 'merge-system-to-head'      // 合并所有 system 消息到列表头部
    | 'merge-consecutive-roles'   // 合并连续相同角色的消息
    | 'ensure-alternating-roles'  // 确保 user/assistant 角色交替
    | 'convert-system-to-user';   // 将 system 角色转换为 user 角色
  
  /** 是否启用此规则 */
  enabled: boolean;

  /**
   * 合并消息时使用的分隔符
   * @default "\n\n---\n\n"
   */
  separator?: string;
}

/**
 * LLM 参数配置
 * 支持大多数 LLM API 的通用参数
 */
export interface LlmParameters {
  // ===== 基础采样参数 =====
  /** 温度，控制输出的随机性（0-2） */
  temperature: number;
  /** 单次响应的最大 token 数量 */
  maxTokens: number;
  /** Top-p 采样参数（0-1） */
  topP?: number;
  /** Top-k 采样参数 */
  topK?: number;
  /** 频率惩罚（-2.0 到 2.0） */
  frequencyPenalty?: number;
  /** 存在惩罚（-2.0 到 2.0） */
  presencePenalty?: number;
  /** 随机种子，用于确定性采样 */
  seed?: number;
  /** 停止序列 */
  stop?: string | string[];

  // ===== 高级参数 =====
  /** 生成的响应数量 */
  n?: number;
  /** 是否返回 logprobs */
  logprobs?: boolean;
  /** 返回的 top logprobs 数量（0-20） */
  topLogprobs?: number;
  /** 补全中可生成的最大标记数（替代 maxTokens，优先级更高） */
  maxCompletionTokens?: number;
  /** o系列模型的推理工作约束 */
  reasoningEffort?: "low" | "medium" | "high";
  /** 标记偏差配置 */
  logitBias?: Record<string, number>;
  /** 是否存储输出用于模型蒸馏 */
  store?: boolean;
  /** 用户标识符 */
  user?: string;
  /** 服务层级 */
  serviceTier?: "auto" | "default" | "flex";

  // ===== 响应格式 =====
  /** 响应格式配置 */
  responseFormat?: {
    type: "text" | "json_object" | "json_schema";
    json_schema?: {
      name: string;
      schema: Record<string, any>;
      strict?: boolean;
    };
  };

  // ===== 工具调用 =====
  /** 工具列表（函数调用） */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
      strict?: boolean;
    };
  }>;
  /** 工具选择策略 */
  toolChoice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  /** 是否启用并行工具调用 */
  parallelToolCalls?: boolean;

  // ===== 多模态输出 =====
  /** 输出模态类型 */
  modalities?: Array<"text" | "audio">;
  /** 音频输出参数 */
  audio?: {
    voice:
      | "alloy"
      | "ash"
      | "ballad"
      | "coral"
      | "echo"
      | "fable"
      | "nova"
      | "onyx"
      | "sage"
      | "shimmer";
    format: "wav" | "mp3" | "flac" | "opus" | "pcm16";
  };
  /** 预测输出配置 */
  prediction?: {
    type: "content";
    content:
      | string
      | Array<{
          type: "text";
          text: string;
        }>;
  };

  // ===== 特殊功能 =====
  /** 网络搜索选项 */
  webSearchOptions?: {
    searchContextSize?: "low" | "medium" | "high";
    userLocation?: {
      approximate: {
        city?: string;
        country?: string;
        region?: string;
        timezone?: string;
        type: "approximate";
      };
    };
  };
  /** 流式选项 */
  streamOptions?: {
    includeUsage?: boolean;
  };
  /** 元数据键值对 */
  metadata?: Record<string, string>;

  // ===== Claude 特有参数 =====
  /** Claude: Thinking 模式配置 */
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
  /** Claude: 停止序列（与 stop 类似，但 Claude 专用） */
  stopSequences?: string[];
  /** Claude: 元数据（用户ID等） */
  claudeMetadata?: {
    user_id?: string;
  };

  // ===== 上下文管理 =====
  /** 上下文管理配置 */
  contextManagement?: {
    /** 是否启用最大上下文限制 */
    enabled: boolean;
    /** 最大上下文 Token 数（0 表示不限制，使用模型的默认上限） */
    maxContextTokens: number;
    /** 截断消息时保留的字符数（让消息有简略开头，避免完全被削去） */
    retainedCharacters: number;
  };

  // ===== 上下文后处理管道 =====
  /**
   * 上下文后处理管道配置
   * 按数组顺序依次执行规则，对最终发送给 LLM 的消息列表进行格式转换
   */
  contextPostProcessing?: {
    /** 处理规则列表，按顺序执行 */
    rules: ContextPostProcessRule[];
  };
}

/**
  * 用户档案 (User Profile)
  * 定义用户在对话中扮演的角色
  */
export interface UserProfile {
  /**
   * 档案的唯一标识符
   */
  id: string;

  /**
   * 档案名称
   */
  name: string;

  /**
   * 档案图标（emoji、图标路径或相对文件名）
   */
  icon?: string;

  /**
   * 图标模式
   * @default 'path'
   */
  iconMode?: IconMode;

  /**
   * 档案内容（描述性文本）
   */
  content: string;

  /**
   * 是否启用（默认为 true）
   * 禁用的档案在选择列表中不显示
   */
  enabled?: boolean;

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
   * 智能体名称
   */
  name: string;

  /**
   * 智能体描述（可选）
   */
  description?: string;

  /**
   * 智能体图标（emoji、图标路径或相对文件名）
   */
  icon?: string;

  /**
   * 图标模式
   * @default 'path'
   */
  iconMode?: IconMode;

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
export interface AgentPreset {
  /**
   * 预设的唯一标识符（通常为文件名）
   */
  id: string;

  /**
   * 预设名称（显示在UI上）
   */
  name: string;

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
}
