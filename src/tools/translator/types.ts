/**
 * 翻译目标语言代码。
 * - `"auto"`: 自动检测（仅源语言可选）
 * - 内置代码：见 BUILTIN_TRANSLATOR_LANGUAGES
 * - 自定义：任意字符串（直接作为 prompt 占位符替换）
 *
 * 使用 `(string & {})` 既保留 IDE 对内置代码的自动补全，又允许任意 string。
 */
export type TranslatorLanguageCode = "auto" | (string & {});

/** 语言分组：用于下拉里 el-option-group 分组渲染 */
export type TranslatorLanguageGroup =
  | "meta"
  | "cjk"
  | "europe"
  | "mideast"
  | "south-asia"
  | "custom";

export interface TranslatorLanguageOption {
  label: string;
  value: TranslatorLanguageCode;
  group?: TranslatorLanguageGroup;
}

/** 翻译渠道：一个 LLM Profile + Model 的组合 */
export interface TranslationChannel {
  id: string;
  displayName: string;
  profileId: string;
  modelId: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/** 预设：一组渠道的组合 */
export interface TranslatorPreset {
  id: string;
  name: string;
  icon?: string;
  channels: TranslationChannel[];
  defaultSourceLang: TranslatorLanguageCode;
  defaultTargetLang: TranslatorLanguageCode;
  prompt: string;
}

/** 渠道运行状态 */
export type TranslationResultStatus =
  | "idle"
  | "pending"
  | "streaming"
  | "completed"
  | "aborted"
  | "failed";

/** 单个渠道的翻译结果 */
export interface TranslationResult {
  channelId: string;
  channelName: string;
  content: string;
  status: TranslationResultStatus;
  /** @deprecated 用 status 判断，保留以便老代码兼容 */
  isStreaming: boolean;
  error?: string;
  duration?: number;
  startedAt?: number;
  /** 实际下发给上游的最大输出 token */
  appliedMaxTokens?: number;
  /** 模型自身的最大输出 token 限制 */
  modelOutputLimit?: number;
  finishReason?: string | null;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
  /** 长文本分片翻译任务状态，仅当前会话展示使用 */
  longTextTask?: LongTextTask;
}

/** 翻译历史条目 */
export interface TranslationHistoryEntry {
  id: string;
  timestamp: number;
  sourceText: string;
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  presetId: string;
  results: TranslationResult[];
}

export interface TranslatorSettings {
  /** 当无法从模型推断时使用的兜底输出上限 */
  defaultMaxTokens: number;
  /** 是否按输入长度自动估算输出上限 */
  autoExpandMaxTokens: boolean;
  /** 输出膨胀因子：输出 token 估算 = 字符数 * factor + 预留 */
  outputExpansionFactor: number;
  /** 是否启用流式输出 */
  streamingEnabled: boolean;
  /** 结果区是否在流式输出时自动吸底（用户手动滚动时会暂停吸底） */
  autoScrollResults: boolean;
  /** 是否保存历史记录 */
  saveHistory: boolean;
  /** 默认采样温度（渠道未单独配置时使用） */
  defaultTemperature: number;
  /**
   * 用户自定义的语言名（LLM 友好的英文/原名，如 "Klingon"、"Toki Pona"）。
   * 会出现在所有翻译下拉中，并作为 prompt 占位符直接替换。
   */
  customLanguages: string[];
  /**
   * 输入面板渠道区折叠状态。默认 false（展开），用户主动折叠后跨重启保留。
   */
  channelSectionCollapsed: boolean;
  /**
   * 检测到预估输出/输入会超过模型上限时，是否在 UI 提示并弹二次确认。
   * 默认 true。即使关闭，渠道折叠头的统计/pill 染色等视觉提示仍然显示，
   * 只是不再阻塞翻译按钮。
   */
  warnOnOutputOverflow: boolean;
  /** 是否启用长文本分片翻译功能 */
  splitTranslationEnabled: boolean;
  /** 是否根据模型输出上限智能过滤分片提示 */
  splitSuggestSmartFilter: boolean;
  /** 触发分片翻译提示的字符数阈值 */
  splitThreshold: number;
  /** 默认分片大小 */
  splitChunkSize: number;
  /** 默认分片翻译模式 */
  splitMode: LongTextMode;
  /** 并发模式下的最大并发分片数 */
  splitMaxConcurrent: number;
}

export type LongTextChunkStatus =
  | "waiting"
  | "translating"
  | "completed"
  | "failed";

export interface LongTextChunk {
  index: number;
  sourceText: string;
  translatedText?: string;
  status: LongTextChunkStatus;
  error?: string;
  duration?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
}

export type LongTextTaskStatus =
  | "idle"
  | "splitting"
  | "translating"
  | "completed"
  | "failed"
  | "aborted";

export interface LongTextTask {
  id: string;
  channelName: string;
  status: LongTextTaskStatus;
  progress: number;
  chunks: LongTextChunk[];
  error?: string;
  startedAt?: number;
  duration?: number;
}

export type LongTextMode = "concurrent" | "sequential";

export interface LongTextConfig {
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  profileId: string;
  modelId: string;
  chunkSize: number;
  mode: LongTextMode;
  maxConcurrentChunks: number;
  temperature?: number;
  promptTemplate?: string;
  streaming: boolean;
}

/** 渠道超限风险等级 */
export type ChannelOverflowRisk = "safe" | "warning" | "danger" | "unknown";

/** 估算超限原因（用于 tooltip / banner 文案分支） */
export type ChannelOverflowReason =
  | "output-exceeds" // 预估输出 >= 模型输出上限
  | "near-output-limit" // 预估输出在 70%~100% 区间
  | "input-exceeds-context" // 输入 tokens >= 模型 context 窗口
  | "input-near-context"; // 输入 tokens 在 80%~100% 区间

export interface ChannelEstimation {
  channelId: string;
  channelName: string;
  /** 估算的输出 tokens（沿用 engine 现有公式） */
  estimatedOutputTokens: number;
  /** 估算的输入 tokens（粗估：CJK 1 字 ≈ 1.5 tokens；拉丁文按词数 × 1.3） */
  estimatedInputTokens: number;
  /** 模型输出上限（来自 model metadata，可能 undefined） */
  modelOutputLimit?: number;
  /**
   * 模型上下文窗口（input + output 总和上限，可能 undefined）。
   * 取自 `tokenLimits.contextLength`，缺失时回退到 `contextLengthRange[1]`。
   */
  modelContextLimit?: number;
  /** 综合风险等级 */
  risk: ChannelOverflowRisk;
  /** 命中的具体原因（多个时按严重度优先） */
  reasons: ChannelOverflowReason[];
}
