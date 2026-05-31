export type TranslatorLanguageCode =
  | "auto"
  | "Chinese"
  | "English"
  | "Japanese"
  | "Korean"
  | "French"
  | "German"
  | "Spanish"
  | "Russian";

export interface TranslatorLanguageOption {
  label: string;
  value: TranslatorLanguageCode;
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

export interface TranslateParallelOptions {
  targetLang: string;
  sourceLang?: string;
  basePrompt: string;
  maxTokens?: number | ((channel: TranslationChannel) => number);
  onChannelStream?: (channelId: string, chunk: string) => void;
  onChannelSettled?: (channelId: string, result: TranslationResult) => void;
  signal?: AbortSignal;
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
}

