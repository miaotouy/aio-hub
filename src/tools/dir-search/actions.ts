/**
 * Dir Search Agent Actions
 *
 * 抽离的核心搜索/替换逻辑，不依赖 Vue 响应式系统，
 * 供 ToolRegistry Agent 方法直接调用。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  SearchRequest,
  SearchSummary,
  SearchResultBatch,
  FileSearchResult,
  ReplaceRequest,
  ReplaceResult,
} from "./types";
import type { ToolContext } from "@/services/types";

/** Agent 搜索参数 */
export interface AgentSearchArgs {
  path: string;
  pattern: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeGlobs?: string;
  excludeGlobs?: string;
  useGitignore?: boolean;
  maxResults?: number;
  contextLines?: number;
  /** 结果展示中最多显示的文件数（默认 50） */
  maxDisplayFiles?: number;
  /** 每个文件中最多展示的匹配数（默认 20） */
  maxMatchesPerFile?: number;
}

/** Agent 替换参数 */
export interface AgentReplaceArgs {
  path: string;
  pattern: string;
  replacement: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  preserveCase?: boolean;
  includeGlobs?: string;
  excludeGlobs?: string;
  useGitignore?: boolean;
}

/**
 * 解析逗号分隔的 glob 字符串为数组
 */
function parseGlobs(str?: string): string[] {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Agent 搜索：同步收集流式结果并返回格式化文本
 */
export async function searchDirectory(
  args: AgentSearchArgs,
  context?: ToolContext
): Promise<string> {
  if (!args.path) return "错误: 必须指定搜索目录路径 (path)。";
  if (!args.pattern) return "错误: 必须指定搜索模式 (pattern)。";

  const collectedResults: FileSearchResult[] = [];
  let unlisten: UnlistenFn | null = null;

  // 监听流式结果事件
  unlisten = await listen<SearchResultBatch>(
    "dir-search-result-batch",
    (event) => {
      collectedResults.push(...event.payload.results);
    }
  );

  const request: SearchRequest = {
    rootPath: args.path,
    pattern: args.pattern,
    isRegex: args.isRegex ?? false,
    caseSensitive: args.caseSensitive ?? false,
    wholeWord: args.wholeWord ?? false,
    includeGlobs: parseGlobs(args.includeGlobs),
    excludeGlobs: parseGlobs(args.excludeGlobs),
    useGitignore: args.useGitignore ?? true,
    contextLines: args.contextLines ?? 0,
    maxResults: args.maxResults ?? 200,
  };

  context?.reportStatus("正在搜索目录...", 10);

  let summary: SearchSummary;
  try {
    summary = await invoke<SearchSummary>("dir_search", { request });
  } catch (e) {
    unlisten?.();
    const msg = e instanceof Error ? e.message : String(e);
    return `搜索失败: ${msg}`;
  } finally {
    unlisten?.();
  }

  context?.reportStatus("格式化结果...", 90);

  return formatSearchResults(collectedResults, summary, args);
}

/**
 * Agent 替换：先搜索确认范围，再执行替换
 */
export async function replaceInDirectory(
  args: AgentReplaceArgs,
  context?: ToolContext
): Promise<string> {
  if (!args.path) return "错误: 必须指定目录路径 (path)。";
  if (!args.pattern) return "错误: 必须指定搜索模式 (pattern)。";
  if (args.replacement === undefined || args.replacement === null) {
    return "错误: 必须指定替换文本 (replacement)，可以为空字符串。";
  }

  // 先执行搜索以确定影响范围
  const searchResults: FileSearchResult[] = [];
  let unlisten: UnlistenFn | null = null;

  unlisten = await listen<SearchResultBatch>(
    "dir-search-result-batch",
    (event) => {
      searchResults.push(...event.payload.results);
    }
  );

  const searchRequest: SearchRequest = {
    rootPath: args.path,
    pattern: args.pattern,
    isRegex: args.isRegex ?? false,
    caseSensitive: args.caseSensitive ?? false,
    wholeWord: args.wholeWord ?? false,
    includeGlobs: parseGlobs(args.includeGlobs),
    excludeGlobs: parseGlobs(args.excludeGlobs),
    useGitignore: args.useGitignore ?? true,
    maxResults: 0, // 无限制，需要知道完整范围
  };

  context?.reportStatus("搜索匹配项...", 20);

  try {
    await invoke<SearchSummary>("dir_search", { request: searchRequest });
  } catch (e) {
    unlisten?.();
    const msg = e instanceof Error ? e.message : String(e);
    return `搜索阶段失败: ${msg}`;
  } finally {
    unlisten?.();
  }

  if (searchResults.length === 0) {
    return "未找到匹配项，无需替换。";
  }

  // 执行替换
  const filePaths = searchResults.map((r) => r.filePath);
  const totalMatches = searchResults.reduce(
    (sum, r) => sum + r.matches.length,
    0
  );

  context?.reportStatus(
    `正在替换 ${filePaths.length} 个文件中的 ${totalMatches} 处匹配...`,
    50
  );

  const replaceRequest: ReplaceRequest = {
    filePaths,
    pattern: args.pattern,
    replacement: args.replacement,
    isRegex: args.isRegex ?? false,
    caseSensitive: args.caseSensitive ?? false,
    wholeWord: args.wholeWord ?? false,
    preserveCase: args.preserveCase ?? false,
  };

  let result: ReplaceResult;
  try {
    result = await invoke<ReplaceResult>("dir_replace", {
      request: replaceRequest,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `替换执行失败: ${msg}`;
  }

  context?.reportStatus("替换完成", 100);

  return formatReplaceResult(result, args);
}

/**
 * 智能裁切超长行，以匹配项为中心保留适量上下文
 */
function truncateLine(
  content: string,
  matchStart: number,
  matchEnd: number,
  maxLength = 200
): string {
  if (content.length <= maxLength) {
    return content.trimEnd();
  }

  // 默认向左保留 50 字符，向右保留 100 字符
  const leftKeep = 50;
  const rightKeep = 100;

  // 确保 matchStart 和 matchEnd 有效，否则退化为截取头部
  const startIdx =
    typeof matchStart === "number" && matchStart >= 0 ? matchStart : 0;
  const endIdx =
    typeof matchEnd === "number" && matchEnd >= startIdx
      ? matchEnd
      : content.length;

  let start = Math.max(0, startIdx - leftKeep);
  let end = Math.min(content.length, endIdx + rightKeep);

  // 如果裁切后的长度依然超出 maxLength，则以匹配项为中心进行二次收缩
  if (end - start > maxLength) {
    const matchLen = endIdx - startIdx;
    const remain = maxLength - matchLen;
    if (remain > 0) {
      start = Math.max(0, startIdx - Math.floor(remain / 2));
      end = Math.min(content.length, endIdx + Math.ceil(remain / 2));
    } else {
      // 匹配项本身就极长，那就只展示匹配项本身
      start = startIdx;
      end = endIdx;
    }
  }

  let result = content.slice(start, end);
  if (start > 0) {
    result = "..." + result;
  }
  if (end < content.length) {
    result = result + "...";
  }

  return result.trimEnd();
}

/**
 * 格式化搜索结果为 LLM 可读文本
 */
function formatSearchResults(
  results: FileSearchResult[],
  summary: SearchSummary,
  args: AgentSearchArgs
): string {
  const lines: string[] = [];

  // 摘要
  lines.push(`## 搜索结果`);
  lines.push("");
  lines.push(`- **搜索目录**: ${args.path}`);
  lines.push(
    `- **搜索模式**: \`${args.pattern}\`${args.isRegex ? " (正则)" : ""}`
  );
  lines.push(`- **匹配文件数**: ${summary.filesMatched}`);
  lines.push(`- **总匹配数**: ${summary.totalMatches}`);
  lines.push(`- **扫描文件数**: ${summary.filesScanned}`);
  lines.push(`- **耗时**: ${summary.durationMs}ms`);
  if (summary.cancelled) {
    lines.push(`- ⚠️ 搜索被取消（结果可能不完整）`);
  }
  lines.push("");

  if (results.length === 0) {
    lines.push("未找到匹配项。");
    return lines.join("\n");
  }

  // 结果截断提示
  const maxDisplay = args.maxDisplayFiles ?? 50; // 最多展示 N 个文件的详细结果
  const displayResults = results.slice(0, maxDisplay);
  const truncated = results.length > maxDisplay;

  // 逐文件展示
  for (const file of displayResults) {
    lines.push(`### ${file.relativePath}`);
    lines.push("");

    // 每个文件最多展示 N 个匹配
    const maxMatchesPerFile = args.maxMatchesPerFile ?? 20;
    const displayMatches = file.matches.slice(0, maxMatchesPerFile);

    for (const match of displayMatches) {
      const linePrefix = `L${match.lineNumber}`;
      const content = truncateLine(
        match.lineContent,
        match.matchStart,
        match.matchEnd
      );
      lines.push(`- **${linePrefix}**: \`${escapeBackticks(content)}\``);
    }

    if (file.matches.length > maxMatchesPerFile) {
      lines.push(
        `- ... 还有 ${file.matches.length - maxMatchesPerFile} 处匹配`
      );
    }
    lines.push("");
  }

  if (truncated) {
    lines.push(`---`);
    lines.push(
      `> 结果已截断，仅展示前 ${maxDisplay} 个文件。共 ${results.length} 个文件包含匹配。`
    );
  }

  return lines.join("\n");
}

/**
 * 格式化替换结果
 */
function formatReplaceResult(
  result: ReplaceResult,
  args: AgentReplaceArgs
): string {
  const lines: string[] = [];

  lines.push(`## 替换完成`);
  lines.push("");
  lines.push(
    `- **搜索模式**: \`${args.pattern}\`${args.isRegex ? " (正则)" : ""}`
  );
  lines.push(`- **替换为**: \`${args.replacement}\``);
  lines.push(`- **成功替换文件数**: ${result.filesReplaced}`);
  lines.push(`- **总替换次数**: ${result.totalReplacements}`);

  if (result.filesFailed > 0) {
    lines.push(`- ⚠️ **失败文件数**: ${result.filesFailed}`);
    lines.push("");
    lines.push("### 错误详情");
    lines.push("");
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- \`${err.filePath}\`: ${err.error}`);
    }
    if (result.errors.length > 10) {
      lines.push(`- ... 还有 ${result.errors.length - 10} 个错误`);
    }
  }

  return lines.join("\n");
}

/**
 * 转义反引号以安全嵌入 Markdown 行内代码
 */
function escapeBackticks(str: string): string {
  return str.replace(/`/g, "\\`");
}
