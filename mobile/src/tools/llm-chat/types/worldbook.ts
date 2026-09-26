import type { MessageRole } from "./common";

/**
 * 有效插入位置。旧数据只使用 before_history / after_character / depth，
 * 本轮扩展为 ST 锚点在移动端可表达的子集；outlet 不注入消息。
 */
export type WorldbookEntryPosition =
  | "before_character"
  | "after_character"
  | "before_history"
  | "after_history"
  | "depth"
  | "outlet";

/** ST selectiveLogic：0 and_any / 1 not_all / 2 not_any / 3 and_all。 */
export type WorldbookSelectiveLogic =
  | "and_any"
  | "not_all"
  | "not_any"
  | "and_all";

/**
 * 世界书运行时设置（对齐 ST `world_info_*` 全局项）。
 * 当前运行时只消费 `defaultScanDepth`；递归字段先无损保存，执行属后续项。
 */
export interface MobileWorldbookSettings {
  /** 条目不指定 scanDepth 时的兜底扫描深度。 */
  defaultScanDepth?: number;
  /** 递归扫描开关（当前未执行）。 */
  recursive?: boolean;
  /** 完全关闭递归（当前未执行）。 */
  disableRecursion?: boolean;
  /** 递归最大步数（当前未执行）。 */
  maxRecursionSteps?: number;
  [key: string]: unknown;
}

/**
 * Mobile-first 世界书条目：确定性关键词匹配 + ST 高级语义子集。
 * 向量检索、递归执行、组竞争、自动化为显式边界；相关字段仅无损保存。
 */
export interface MobileWorldbookEntry {
  id: string;
  name?: string;
  keys: string[];
  content: string;
  enabled: boolean;
  /** Constant entries are injected without a keyword match. */
  constant: boolean;
  /** Larger numbers are placed first when several entries activate. */
  order: number;
  position: WorldbookEntryPosition;
  /** ST 原始位置枚举 0-7；仅记录，用于无损回写。 */
  stPosition?: number;
  /** 注入消息角色；ST role 0/1/2 → system/user/assistant。 */
  role?: MessageRole;
  /** Relative to the latest history message; 0 means immediately after it. */
  depth?: number;
  /** Number of latest session-history messages to scan. */
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  /** 启用次要关键词选择性匹配。 */
  selective?: boolean;
  /** 次要关键词，配合 selective / selectiveLogic 使用。 */
  secondaryKeys?: string[];
  /** 次要关键词逻辑，缺省 and_any。 */
  selectiveLogic?: WorldbookSelectiveLogic;
  /** 触发概率，统一 0-100（对齐 ST 单位）；配合 useProbability 生效。 */
  probability?: number;
  /** 是否启用概率；缺省 false。 */
  useProbability?: boolean;
  /** 递归语义字段：当前仅无损保存，运行时未执行递归扫描。 */
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
  delayUntilRecursion?: boolean;
  delayUntilRecursionLevel?: number;
  /** 原始导入条目，保证未知字段与高级语义无损回写。 */
  raw?: Record<string, unknown>;
  /** 未知字段无损保留（如 group / groupWeight / vectorized / automationId）。 */
  [key: string]: unknown;
}

export interface MobileWorldbook {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  entries: MobileWorldbookEntry[];
  /** 书级世界书设置覆盖。 */
  settings?: MobileWorldbookSettings;
  /** 导入时保留的原始 metadata。 */
  rawMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MobileWorldbookConfig {
  worldbooks: MobileWorldbook[];
}
