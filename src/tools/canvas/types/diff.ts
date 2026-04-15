/** 匹配策略枚举 */
export type DiffMatchStrategy = "exact" | "trimEnd" | "trim" | "fuzzy";

/** Diff 可选参数 */
export interface DiffOptions {
  /**
   * 提示搜索起始行号（1-based，与编辑器行号一致）
   * - 优先在该行附近搜索，显著缩小匹配范围
   * - 当存在重复匹配时，用于消歧义（选择最接近此行号的匹配）
   * - 不强制精确：如果该行号附近没找到，仍会回退到全文搜索
   */
  startLine?: number;
}

/** Diff 应用结果 */
export interface DiffResult {
  /** 替换后的完整文件内容 */
  content: string;
  /** 使用的匹配策略 */
  strategy: DiffMatchStrategy;
  /** 匹配置信度 0~1（exact/trimEnd/trim 为 1.0，fuzzy 为实际相似度） */
  confidence: number;
  /** 匹配到的行范围 [startLine, endLine]（1-based，与编辑器行号一致） */
  matchRange: [number, number];
  /** search 在文件中的总匹配次数（含当前匹配） */
  duplicateCount: number;
  /** 警告信息列表 */
  warnings: string[];
}

/** 模糊匹配失败时的候选信息 */
export interface FuzzyMatchCandidate {
  confidence: number;
  lineRange: [number, number];
  preview: string;
}

/**
 * 模糊匹配失败异常
 * 当相似度在 0.75 ~ 0.85 之间时抛出
 */
export class DiffFuzzyMatchError extends Error {
  constructor(public readonly bestMatch: FuzzyMatchCandidate) {
    super(
      `无法精确匹配代码块，但在第 ${bestMatch.lineRange[0]}-${bestMatch.lineRange[1]} 行找到 ${(bestMatch.confidence * 100).toFixed(0)}% 相似的片段：\n${bestMatch.preview}\n请检查 search 内容是否需要更新。`,
    );
    this.name = "DiffFuzzyMatchError";
  }
}
