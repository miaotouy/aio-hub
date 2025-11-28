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