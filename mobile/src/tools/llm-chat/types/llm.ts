/**
 * 上下文后处理规则
 * 现在 `type` 字段为任意字符串，对应注册到 contextPipelineStore 中的处理器 ID。
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
  custom?: {
    /** 是否启用自定义参数 */
    enabled: boolean;
    /** 参数键值对 */
    params: Record<string, any>;
  };

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
    retainedCharacters: number | undefined;
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
 * 默认上下文压缩配置
 */
/**
 * 默认上下文压缩提示词模板
 * 设计目标：全面捕捉对话的核心信息、关键转折点和待处理事项，确保上下文连续性
 */
export const DEFAULT_CONTEXT_COMPRESSION_PROMPT = `你的任务是创建一份详细的对话摘要，密切关注用户的明确请求和助手之前采取的行动。
这份摘要应全面捕捉核心信息、关键概念和重要决策，这些对于继续对话和支持任何持续任务至关重要。

摘要应结构如下：

## 上下文摘要

### 1. 对话概述
关于整个对话中讨论内容的高级概述。这应该写得让某人能够快速理解对话的主题和整体流程。

### 2. 当前焦点
详细描述在此请求之前正在讨论或处理的内容。特别注意对话中较新的消息和最近的交互。

### 3. 关键概念与主题
列出所有重要的概念、术语、方法论或主题，这些可能与继续此对话相关：
- [概念/主题 1]
- [概念/主题 2]
- [...]

### 4. 重要信息与资料
如果适用，记录对话中提及的重要信息、数据、引用或资源：
- [信息/资料 1]: [简要说明]
- [信息/资料 2]: [简要说明]
- [...]

### 5. 已解决与进行中的事项
记录迄今为止已解决的问题、已完成的任务，以及任何正在进行的讨论或工作。

### 6. 待处理事项与后续方向
概述所有待处理的请求、未完成的任务，以及对话可能的后续方向：
- [事项 1]: [详细说明和当前状态]
- [事项 2]: [详细说明和当前状态]
- [...]

---

以下是需要压缩的对话历史：

{context}

---

**输出要求：**
1. 使用中文输出
2. 保持客观中立，忠实于原始对话内容
3. 摘要应简洁但信息完整，不超过 3000 字
4. 对于任何待处理事项，请直接引用最近对话中的内容，确保任务之间上下文不会丢失信息
5. 仅输出摘要内容，不包括任何额外的评论或解释`;

/**
 * 续写上下文压缩提示词模板
 * 用于在已有压缩摘要的基础上，根据新的对话内容生成更新后的摘要。
 */
export const CONTINUE_CONTEXT_COMPRESSION_PROMPT = `你的任务是根据新增的对话内容，生成一份**全新的、完整的对话摘要**。

**重要说明：**
- "前情提要"是之前对话的摘要，仅供你**理解历史背景**使用
- 你需要输出的是一份**独立完整的新摘要**，而不是在旧摘要上追加内容
- 新摘要应反映对话的**最新状态**：保留仍然相关的历史信息，更新或移除已过时的内容

摘要应使用以下结构：

## 上下文摘要

### 1. 对话概述
提供整个对话（从最初到现在）的高级概述，重点突出当前阶段。

### 2. 当前焦点
详细描述最近正在讨论或处理的内容。

### 3. 关键概念与主题
列出所有重要的概念、术语、方法论或主题。

### 4. 重要信息与资料
记录对话中提及的重要信息、数据、引用或资源。

### 5. 已解决与进行中的事项
总结迄今为止已解决的问题和正在进行的工作。

### 6. 待处理事项与后续方向
列出所有待处理的请求和未来的对话方向。

---

【前情提要 - 仅供参考】
{previous_summary}

---

【新增对话历史 - 需要总结的内容】
{context}

---

**输出要求：**
1. 使用中文输出
2. 输出一份**完整独立的新摘要**，不要写成"在原有基础上新增了..."这种追加式表述
3. 摘要应简洁但信息完整，不超过 3000 字
4. 仅输出摘要内容，不包括任何额外的评论或解释`;

export const DEFAULT_CONTEXT_COMPRESSION_CONFIG: ContextCompressionConfig = {
  enabled: false,
  autoTrigger: true,
  triggerMode: "token",
  tokenThreshold: 80000,
  countThreshold: 50,
  protectRecentCount: 10,
  compressCount: 20,
  minHistoryCount: 15,
  summaryRole: "system",
  summaryTemperature: 0.3,
  summaryMaxTokens: 4096,
  summaryPrompt: DEFAULT_CONTEXT_COMPRESSION_PROMPT,
  continueSummaryPrompt: CONTINUE_CONTEXT_COMPRESSION_PROMPT,
};

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
  /** 摘要生成温度 */
  summaryTemperature?: number;
  /** 摘要生成最大 Token 数 */
  summaryMaxTokens?: number;
  /** 摘要提示词模板 */
  summaryPrompt?: string;
  /** 续写摘要提示词模板 */
  continueSummaryPrompt?: string;
}
