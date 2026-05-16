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
  /** 匹配行之前的 N 行上下文（仅 contextLines > 0 时存在） */
  contextBefore?: string[];
  /** 匹配行之后的 N 行上下文（仅 contextLines > 0 时存在） */
  contextAfter?: string[];
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
  preserveCase: boolean;
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

/** 单项替换请求 */
export interface ReplaceSingleRequest {
  filePath: string;
  lineNumber: number;
  matchStart: number;
  matchEnd: number;
  replacement: string;
  preserveCase: boolean;
}

/** 单项替换结果 */
export interface ReplaceSingleResult {
  success: boolean;
  originalText: string;
  replacedText: string;
}

/** 高亮片段 */
export interface HighlightPart {
  text: string;
  isMatch: boolean;
}

/** 当前聚焦的匹配项（用于预览定位） */
export interface TargetMatch {
  lineNumber: number;
  matchStart: number;
  matchEnd: number;
  /** 序列号，用于强制触发 watch */
  _seq?: number;
}

/** 搜索结果批次（IPC 批处理） */
export interface SearchResultBatch {
  results: FileSearchResult[];
}

/** 结果视图模式 */
export type ViewMode = "list" | "tree";

/** 树形视图的目录节点 */
export interface DirectoryNode {
  /** 显示名称（可能是合并后的路径段，如 "src/tools/dir-search"） */
  name: string;
  /** 完整相对路径 */
  path: string;
  /** 子目录节点 */
  children: DirectoryNode[];
  /** 该目录下直接包含的文件结果 */
  files: FileSearchResult[];
  /** 子树中的匹配总数（含子目录） */
  totalMatches: number;
}

/** 上下文块：多个相邻匹配合并后的连续代码区域 */
export interface ContextBlock {
  /** 块的起始行号（1-based） */
  startLine: number;
  /** 块内所有行（含匹配行和上下文行） */
  lines: ContextLine[];
}

/** 上下文块中的单行 */
export interface ContextLine {
  /** 行号（1-based） */
  lineNumber: number;
  /** 行内容 */
  content: string;
  /** 该行中的匹配信息（null 表示纯上下文行） */
  matchInfo: { matchStart: number; matchEnd: number } | null;
}
