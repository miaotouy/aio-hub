import type { Asset } from '@/types/asset-management';
import type { MessageRole, MessageStatus, MessageType } from './common';

/**
 * 注入策略 - 控制消息在上下文中的位置
 *
 * 用于预设消息的高级位置控制，支持深度注入和锚点注入两种模式。
 * 如果未定义此策略，则消息按数组顺序排列（默认行为）。
 */
export interface InjectionStrategy {
  /**
   * 深度注入：相对于会话历史末尾的位置
   * - 0: 紧跟在最新消息之后（默认行为）
   * - N: 插入到倒数第 N 条消息之后 (如果历史不足 N 条，则插入到最前面)
   *
   * 适用场景：作者备注、角色提醒等需要"靠近当前对话"的内容
   */
  depth?: number;

  /**
   * 高级深度配置 (字符串语法)
   * 优先级高于 depth。
   *
   * 支持多种语法格式，用逗号分隔组合：
   *
   * 1. **单点**：`N` - 仅在深度 N 处注入
   *    - 例如 `5` 表示在深度 5 注入
   *
   * 2. **多点**：`N1, N2, N3` - 在多个指定深度各注入一次
   *    - 例如 `3, 10, 15` 表示在深度 3、10、15 各注入一次
   *
   * 3. **循环**：`S~I` 或 `S:I` - 从深度 S 开始，每隔 I 条重复注入
   *    - 例如 `10~5` 表示在深度 10, 15, 20... 处注入
   *    - `:` 和 `~` 可互换使用
   *
   * 4. **混合**：以上语法的任意组合
   *    - 例如 `3, 10~5` 表示在深度 3 注入，然后从 10 开始每 5 条注入
   *
   * 行为差异（与 depth 的区别）：
   * - 遵循"不到深度不注入"原则
   * - 如果计算出的深度大于当前历史消息数量，则该注入点会被忽略
   */
  depthConfig?: string;

  /**
   * 锚点注入：目标锚点的 ID
   * 如 'chat_history', 'user_profile'
   *
   * 注意：锚点由系统内置或插件注册，用户只能选择已存在的锚点
   */
  anchorTarget?: string;

  /**
   * 相对锚点的位置
   * - 'before': 插入到锚点之前
   * - 'after': 插入到锚点之后
   */
  anchorPosition?: 'before' | 'after';

  /**
   * 插入顺序权重
   * 同一注入点内的排序：值越大越靠近新消息（对话末尾），值越小越靠近 System Prompt。
   * 默认 100。
   */
  order?: number;
}

/**
 * 消息节点（树形结构）
 */
export type TranslationDisplayMode = "original" | "translation" | "both";

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
   * 消息显示名称（可选）
   * 用于在 UI 中标识此预设消息，便于区分和管理
   */
  name?: string;

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
   * 注入策略（可选）
   * 控制消息在上下文中的精确位置，支持深度注入和锚点注入。
   * 如果未定义，则按数组顺序排列（现有行为）。
   */
  injectionStrategy?: InjectionStrategy;

  /**
   * 模型匹配配置（可选）
   * 用于控制该消息是否在当前模型下生效
   * 如果未定义或 enabled 为 false，则对所有模型生效
   */
  modelMatch?: {
    /** 是否启用匹配 */
    enabled: boolean;
    /** 匹配规则列表（正则字符串），只要满足其中一个即生效 */
    patterns: string[];
  };

  /**
   * 消息创建的时间戳 (ISO 8601 格式)
   */
  timestamp?: string;

  /**
   * 消息最后更新的时间戳 (ISO 8601 格式)
   */
  updatedAt?: string;

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
    /** 生成此消息时使用的用户档案 ID */
    userProfileId?: string;
    /** 生成此消息时使用的用户档案名称（快照） */
    userProfileName?: string;
    /** 生成此消息时使用的用户档案图标（快照） */
    userProfileIcon?: string;
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
    /** 请求开始时间戳 */
    requestStartTime?: number;
    /** 请求结束时间戳 */
    requestEndTime?: number;
    /** 首字生成时间戳（用于计算 TTFT） */
    firstTokenTime?: number;
    /** 平均生成速度 (tokens/s) */
    tokensPerSecond?: number;
    /** 请求参数快照（记录生成此消息时实际使用的参数） */
    requestParameters?: Record<string, any>;
    /** 虚拟时间配置快照（记录生成此消息时使用的虚拟时间配置） */
    virtualTimeConfig?: {
      virtualBaseTime: string;
      realBaseTime: string;
      timeScale?: number;
    };
    /** SillyTavern 预设导入时的原始名称 */
    stPromptName?: string;
    /** 消息翻译结果 */
    translation?: {
      /** 翻译后的内容 */
      content: string;
      /** 目标语言 */
      targetLang: string;
      /** 使用的模型标识符 */
      modelIdentifier?: string;
      /** 翻译时间戳 */
      timestamp?: number;
      /** 是否显示翻译（开关状态） */
      visible?: boolean;
      /** 显示模式：translation=仅译文, both=双语对照 */
      displayMode?: TranslationDisplayMode;
    };
    /** 是否为压缩/摘要节点 */
    isCompressionNode?: boolean;
    /** 被此节点压缩/隐藏的节点 ID 列表 */
    compressedNodeIds?: string[];
    /** 压缩时间戳 */
    compressionTimestamp?: number;
    /** 压缩前的 Token 总数 */
    originalTokenCount?: number;
    /** 压缩前的消息条数 */
    originalMessageCount?: number;
    /** 压缩配置快照 */
    compressionConfig?: {
      triggerMode: string;
      thresholds: Record<string, number>;
      summaryRole: string;
    };
  };
}