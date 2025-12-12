/**
 * 上下文后处理规则
 * 现在 `type` 字段为任意字符串，对应注册到 postProcessingPipelineStore 中的处理器 ID。
 * 内置处理器 ID 示例：
 * - 'post:merge-system-to-head': 合并所有 system 消息到列表头部
 * - 'post:merge-consecutive-roles': 合并连续相同角色的消息
 * - 'post:ensure-alternating-roles': 确保 user/assistant 角色交替
 * - 'post:convert-system-to-user': 将 system 角色转换为 user 角色
 */
export interface ContextPostProcessRule {
  /** 规则类型（对应处理器 ID） */
  type: string;

  /** 是否启用此规则 */
  enabled: boolean;

  /**
   * 其他任意配置项
   * 允许处理器定义自己的配置参数，如 separator, userPlaceholder 等
   */
  [key: string]: any;
}

/**
 * Gemini 安全设置
 */
export interface GeminiSafetySetting {
  category:
    | "HARM_CATEGORY_HARASSMENT"
    | "HARM_CATEGORY_HATE_SPEECH"
    | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
    | "HARM_CATEGORY_DANGEROUS_CONTENT"
    | "HARM_CATEGORY_CIVIC_INTEGRITY";
  threshold:
    | "BLOCK_NONE"
    | "BLOCK_ONLY_HIGH"
    | "BLOCK_MEDIUM_AND_ABOVE"
    | "BLOCK_LOW_AND_ABOVE"
    | "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
    | "OFF";
}

/**
 * LLM 参数配置
 * 支持大多数 LLM API 的通用参数
 */
export interface LlmParameters {
  /** 自定义参数容器 */
  custom?: Record<string, any>;

  // ===== 基础采样参数 =====
  /** 温度，控制输出的随机性（0-2） */
  temperature?: number;
  /** 单次响应的最大 token 数量 */
  maxTokens?: number;
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
  reasoningEffort?: string;
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
  toolChoice?:
    | "none"
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } };
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
  /** 是否启用思考模式 */
  thinkingEnabled?: boolean;
  /** 思考预算 Token 数 */
  thinkingBudget?: number;
  /** 是否包含思考摘要（Gemini） */
  includeThoughts?: boolean;

  // ===== Claude 特有参数 =====
  /** Claude: 停止序列（与 stop 类似，但 Claude 专用） */
  stopSequences?: string[];
  /** Claude: 元数据（用户ID等） */
  claudeMetadata?: {
    user_id?: string;
  };

  // ===== Gemini 特有参数 =====
  /** Gemini: 安全设置 */
  safetySettings?: GeminiSafetySetting[];

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

  /**
   * 显式启用的参数列表
   * 如果存在此字段，只有在此列表中的参数才会被发送给 LLM API。
   * 如果不存在此字段，则回退到旧行为（发送所有非 undefined 的参数）。
   */
  enabledParameters?: Array<keyof Omit<LlmParameters, "custom">>;

  /**
   * 上下文压缩配置
   */
  contextCompression?: ContextCompressionConfig;
}
/**
 * 用于唯一标识一个模型的结构
 */
export interface ModelIdentifier {
  /** Profile ID */
  profileId: string;
  /** Model ID */
  modelId: string;
}

/**
 * 上下文压缩配置
 */
export interface ContextCompressionConfig {
  /** 是否启用上下文压缩 */
  enabled?: boolean;
  /** 是否自动触发压缩 */
  autoTrigger?: boolean;
  /** 触发模式：基于 Token 数量、消息条数或两者 */
  triggerMode?: "token" | "count" | "both";
  /** Token 阈值 */
  tokenThreshold?: number;
  /** 消息条数阈值 */
  countThreshold?: number;
  /** 保护最近 N 条消息不被压缩 */
  protectRecentCount?: number;
  /** 每次压缩多少条消息 */
  compressCount?: number;
  /** 至少多少条历史才触发压缩 */
  minHistoryCount?: number;
  /** 摘要节点的角色 */
  summaryRole?: "system" | "assistant" | "user";
  /** 生成摘要的模型（可选，默认使用当前模型） */
  summaryModel?: ModelIdentifier;
  /** 摘要提示词模板 */
  summaryPrompt?: string;
}
