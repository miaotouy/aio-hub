/**
 * LLM API Key 管理相关类型定义
 */

export interface ApiKeyStatus {
  /**
   * API Key 字符串 (脱敏存储或完整存储)
   */
  key: string;
  /**
   * 是否由用户手动启用
   */
  isEnabled: boolean;
  /**
   * 是否因为错误被系统自动熔断 (例如 429)
   */
  isBroken: boolean;
  /**
   * 连续错误计数
   */
  errorCount: number;
  /**
   * 最后一次错误时间
   */
  lastErrorTime?: number;
  /**
   * 最后一次错误消息
   */
  lastErrorMessage?: string;
  /**
   * 熔断发生的时间
   */
  disabledTime?: number;
  /**
   * 最后一次使用时间
   */
  lastUsedTime?: number;
  /**
   * 备注信息 (如：触发频率限制)
   */
  note?: string;
}

/**
 * 某个 Profile 下的 Key 状态 Map
 * Key 为 API Key 字符串，Value 为状态对象
 */
export type ProfileKeyStatusMap = Record<string, ApiKeyStatus>;

/**
 * 持久化存储结构
 */
export interface KeyStatesStorage {
  /**
   * 所有 Profile 的 Key 状态记录
   * Key 为 Profile ID
   */
  states: Record<string, ProfileKeyStatusMap>;
  /**
   * 每个 Profile 最后一次使用的 Key 索引 (用于轮询)
   */
  lastUsedIndices: Record<string, number>;
  /**
   * 是否启用自动禁用熔断
   */
  enableAutoDisable: boolean;
  /**
   * 自动恢复时长 (毫秒)，默认 1 分钟
   */
  autoRecoveryTime: number;
}
