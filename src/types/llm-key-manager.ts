/**
 * LLM API Key 状态管理类型定义
 */

export interface ApiKeyStatus {
  /** 原始 API Key */
  key: string;
  /** 用户手动启用的状态 */
  isEnabled: boolean;
  /** 自动检测到的损坏状态（熔断） */
  isBroken: boolean;
  /** 连续错误计数 */
  errorCount: number;
  /** 最后一次成功使用的时间戳 */
  lastUsedTime?: number;
  /** 最后一次报错的时间戳 */
  lastErrorTime?: number;
  /** 自动禁用的时间戳 */
  disabledTime?: number;
  /** 最后一次报错的消息 */
  lastErrorMessage?: string;
  /** 备注信息（例如：额度耗尽、频率限制等） */
  note?: string;
}

/**
 * 每个 Profile 对应的 Key 状态 Map
 * Key 为 API Key 的明文
 */
export type ProfileKeyStatusMap = Record<string, ApiKeyStatus>;

/**
 * 全局 Key 状态存储结构
 * Key 为 profileId
 */
export interface KeyStatesStorage {
  /** profileId -> KeyStatusMap */
  states: Record<string, ProfileKeyStatusMap>;
  /** 上次使用的 Key 索引（用于轮询持久化，可选） */
  lastUsedIndices: Record<string, number>;
  /** 是否启用自动熔断/禁用 */
  enableAutoDisable: boolean;
  /** 自动恢复时间（毫秒），针对 429 等错误，默认 60000 (1分钟) */
  autoRecoveryTime?: number;
}