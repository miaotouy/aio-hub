/**
 * LLM Chat 模块的类型定义
 */

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 消息生成状态
 */
export type MessageStatus = 'generating' | 'complete' | 'error';

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
   * 消息内容
   */
  content: string;

  /**
   * 消息作者的角色
   */
  role: MessageRole;

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
   * 消息创建的时间戳 (ISO 8601 格式)
   */
  timestamp: string;

  /**
   * 附加元数据
   */
  metadata?: {
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
    /** Token 使用情况 */
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

/**
 * 聊天会话（树形历史结构）
 *
 * 设计理念：会话与智能体解耦
 * - 会话引用当前使用的智能体ID
 * - 每条消息的 metadata 记录生成时使用的智能体/模型
 * - 用户可以在同一会话中切换不同智能体继续对话
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
   * 当前使用的智能体 ID
   * 如果为 null，则表示使用自定义配置（无智能体）
   */
  currentAgentId: string | null;

  /**
   * 会话级别的参数覆盖（可选）
   * 用于临时微调智能体的参数，不影响智能体本身的配置
   */
  parameterOverrides?: Partial<LlmParameters>;

  /**
   * 会话级别的系统提示词覆盖（可选）
   * 用于临时覆盖智能体的系统提示词
   */
  systemPromptOverride?: string;

  /**
   * 会话创建和最后更新的时间戳
   */
  createdAt: string;
  updatedAt: string;
}

/**
 * LLM 参数配置
 */
export interface LlmParameters {
  temperature: number;
  maxTokens: number;
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
   * 智能体图标（emoji 或图标路径）
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
   * 系统提示词
   */
  systemPrompt?: string;

  /**
   * 上下文预设
   * 这个是一个在会话上层的预设，会包裹会话
   * 比如：
   * system消息1
   * user消息1
   * 模型消息1
   * user消息2
   * 模型消息2
   * 【会话消息】
   * 模型消息3
   * ……
   * 先留着吧不着急做
   */
  // contextPreset?:;

  /**
   * 参数配置
   */
  parameters: LlmParameters;

  /**
   * 创建时间
   */
  createdAt: string;

  /**
   * 最后使用时间
   */
  lastUsedAt?: string;

  /**
   * 是否为内置预设
   */
  isBuiltIn?: boolean;
}