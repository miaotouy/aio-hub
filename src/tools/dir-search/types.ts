/** 单个匹配项 */
export interface SearchMatch {
  /** 匹配所在行号（1-based） */
  lineNumber: number;
  /** 行内容（完整的一行文本） */
  lineContent: string;
  /** 匹配在行内的起始字符偏移（char 索引） */
  matchStart: number;
  /** 匹配在行内的结束字符偏移（char 索引） */
  matchEnd: number;
}

/** 单个文件的搜索结果 */
export interface FileSearchResult {
  /** 文件绝对路径 */
  filePath: string;
  /** 文件相对于搜索根目录的路径 */
  relativePath: string;
  /** 该文件中的所有匹配 */
  matches: SearchMatch[];
}

/** 搜索进度事件 */
export interface SearchProgress {
  /** 已扫描的文件数 */
  filesScanned: number;
  /** 已找到匹配的文件数 */
  filesMatched: number;
  /** 总匹配数 */
  totalMatches: number;
  /** 当前正在扫描的文件路径 */
  currentFile: string | null;
}

/** 搜索完成汇总 */
export interface SearchSummary {
  /** 总扫描文件数 */
  filesScanned: number;
  /** 包含匹配的文件数 */
  filesMatched: number;
  /** 总匹配数 */
  totalMatches: number;
  /** 搜索耗时（毫秒） */
  durationMs: number;
  /** 是否被用户取消 */
  cancelled: boolean;
}

/** 搜索请求参数 */
export interface SearchRequest {
  rootPath: string;
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeGlobs: string[];
  excludeGlobs: string[];
  useGitignore: boolean;
  contextLines?: number;
  maxResults?: number;
}

/** 替换请求 */
export interface ReplaceRequest {
  filePaths: string[];
  pattern: string;
  replacement: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}

/** 替换结果 */
export interface ReplaceResult {
  filesReplaced: number;
  filesFailed: number;
  totalReplacements: number;
  errors: ReplaceError[];
}

/** 替换错误 */
export interface ReplaceError {
  filePath: string;
  error: string;
}

/** 高亮片段 */
export interface HighlightPart {
  text: string;
  isMatch: boolean;
}

/** 结果视图模式 */
export type ViewMode = "list" | "tree";
