import { ref, computed, watch, shallowRef, triggerRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { watchDebounced } from "@vueuse/core";
import type {
  FileSearchResult,
  SearchProgress,
  SearchSummary,
  SearchRequest,
  SearchResultBatch,
  ReplaceRequest,
  ReplaceResult,
  ReplaceSingleRequest,
  ReplaceSingleResult,
} from "../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useDirSearchUiState } from "./useDirSearchUiState";

const errorHandler = createModuleErrorHandler("tools/dir-search/useDirSearch");

export function useDirSearch() {
  const uiState = useDirSearchUiState();

  // 搜索参数（直接引用持久化的 UI 状态）
  const rootPath = uiState.lastRootPath;
  const pattern = uiState.pattern;
  const replacement = uiState.replacement;
  const isRegex = uiState.isRegex;
  const caseSensitive = uiState.caseSensitive;
  const wholeWord = uiState.wholeWord;
  const includeGlobs = uiState.includeGlobs;
  const excludeGlobs = uiState.excludeGlobs;
  const useGitignore = uiState.useGitignore;

  // 搜索状态
  const isSearching = ref(false);
  const results = shallowRef<Map<string, FileSearchResult>>(new Map());
  const summary = ref<SearchSummary | null>(null);
  const progress = ref<SearchProgress | null>(null);

  // 搜索代计数器：用于解决并发竞态，确保旧搜索的 finally 不会破坏新搜索的状态
  let searchGeneration = 0;

  // UI 状态
  const showReplace = uiState.showReplace;
  const selectedFilePath = ref<string | null>(null);
  const expandedFiles = shallowRef<Set<string>>(new Set());

  // 计算属性
  const resultsList = computed(() => Array.from(results.value.values()));
  const totalMatches = computed(() => {
    let count = 0;
    for (const result of results.value.values()) {
      count += result.matches.length;
    }
    return count;
  });
  const totalFiles = computed(() => results.value.size);

  // 事件监听器
  let unlistenResult: UnlistenFn | null = null;
  let unlistenProgress: UnlistenFn | null = null;

  // 前端缓冲区：收集 batch 后定时 flush，避免频繁触发响应式更新
  let pendingResults: FileSearchResult[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingResults() {
    if (pendingResults.length === 0) return;
    const toFlush = pendingResults;
    pendingResults = [];
    flushTimer = null;

    // 前端侧上限防护：计算当前已有匹配数，超过上限则截断
    const maxR = uiState.maxResults.value;
    let currentTotal = totalMatches.value;

    // 直接修改 shallowRef 内部的 Map，最后统一 triggerRef
    const map = results.value;
    const expanded = expandedFiles.value;
    const shouldExpand = uiState.autoExpandResults.value;
    for (const result of toFlush) {
      // 上限检查：如果已超过上限，停止添加
      if (maxR > 0 && currentTotal >= maxR) {
        break;
      }
      map.set(result.filePath, result);
      currentTotal += result.matches.length;
      if (shouldExpand) {
        expanded.add(result.filePath);
      }
    }
    // 触发响应式更新：赋值新引用以确保子组件 prop 比较能检测到变化
    triggerRef(results);
    if (shouldExpand) {
      expandedFiles.value = new Set(expanded);
    }
  }

  function scheduleFlush() {
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingResults, 200);
    }
  }

  /** 设置事件监听 */
  async function setupListeners() {
    // 清理旧监听
    await cleanupListeners();

    // 监听批量结果事件
    unlistenResult = await listen<SearchResultBatch>("dir-search-result-batch", (event) => {
      const batch = event.payload;

      // 前端侧上限防护：如果已有结果数超过 maxResults，丢弃后续 batch
      const maxR = uiState.maxResults.value;
      if (maxR > 0 && totalMatches.value >= maxR) {
        return;
      }

      // 先存入缓冲区，不立即触发响应式
      pendingResults.push(...batch.results);
      scheduleFlush();
    });

    unlistenProgress = await listen<SearchProgress>("dir-search-progress", (event) => {
      progress.value = event.payload;
    });
  }

  /** 清理事件监听 */
  async function cleanupListeners() {
    if (unlistenResult) {
      unlistenResult();
      unlistenResult = null;
    }
    if (unlistenProgress) {
      unlistenProgress();
      unlistenProgress = null;
    }
    // flush 剩余缓冲
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingResults.length > 0) {
      flushPendingResults();
    }
  }

  /** 执行搜索 */
  async function executeSearch() {
    if (!rootPath.value || !pattern.value) return;

    // 如果正在搜索，先取消上一次
    if (isSearching.value) {
      await cancelSearch();
      await cleanupListeners();
    }

    // 递增搜索代，标记当前搜索会话
    const currentGeneration = ++searchGeneration;

    // 清空旧结果
    results.value = new Map();
    expandedFiles.value = new Set();
    summary.value = null;
    progress.value = null;
    isSearching.value = true;

    // 设置监听
    await setupListeners();

    // 解析 glob 字符串为数组
    const parseGlobs = (str: string): string[] =>
      str
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const request: SearchRequest = {
      rootPath: rootPath.value,
      pattern: pattern.value,
      isRegex: isRegex.value,
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
      includeGlobs: parseGlobs(includeGlobs.value),
      excludeGlobs: parseGlobs(excludeGlobs.value),
      useGitignore: useGitignore.value,
      maxResults:
        Number.isFinite(uiState.maxResults.value) && uiState.maxResults.value > 0
          ? uiState.maxResults.value
          : undefined,
    };

    try {
      const result = await invoke<SearchSummary>("dir_search", { request });
      // 只有当前代的搜索才更新结果
      if (currentGeneration === searchGeneration) {
        summary.value = result;
      }
    } catch (e) {
      if (currentGeneration === searchGeneration) {
        errorHandler.error(e, "搜索执行失败");
      }
    } finally {
      // 只有当前代的搜索才执行清理，避免破坏后续搜索的状态
      if (currentGeneration === searchGeneration) {
        isSearching.value = false;
        await cleanupListeners();
      }
    }
  }

  /** 取消搜索 */
  async function cancelSearch() {
    if (!isSearching.value) return;

    // 立即递增 generation，使当前搜索的 finally 失效
    searchGeneration++;
    // 立即更新前端状态，给用户即时反馈
    isSearching.value = false;
    // 清理监听器，停止接收后续结果
    await cleanupListeners();

    try {
      await invoke("dir_search_cancel");
    } catch (e) {
      errorHandler.error(e, "取消搜索失败");
    }
  }

  /** 执行替换 */
  async function executeReplace(filePaths?: string[]) {
    if (!pattern.value || replacement.value === undefined) return;

    const targetPaths = filePaths || Array.from(results.value.keys());
    if (targetPaths.length === 0) return;

    const request: ReplaceRequest = {
      filePaths: targetPaths,
      pattern: pattern.value,
      replacement: replacement.value,
      isRegex: isRegex.value,
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
    };

    try {
      const result = await invoke<ReplaceResult>("dir_replace", { request });
      return result;
    } catch (e) {
      errorHandler.error(e, "替换执行失败");
      return null;
    }
  }

  /** 切换文件展开/折叠 */
  function toggleFileExpand(filePath: string) {
    const newSet = new Set(expandedFiles.value);
    if (newSet.has(filePath)) {
      newSet.delete(filePath);
    } else {
      newSet.add(filePath);
    }
    expandedFiles.value = newSet;
  }

  /** 全部展开 */
  function expandAll() {
    const newSet = new Set(expandedFiles.value);
    for (const key of results.value.keys()) {
      newSet.add(key);
    }
    expandedFiles.value = newSet;
  }

  /** 全部折叠 */
  function collapseAll() {
    expandedFiles.value = new Set();
  }

  /** 清空搜索结果 */
  function clearResults() {
    results.value = new Map();
    expandedFiles.value = new Set();
    summary.value = null;
    progress.value = null;
    selectedFilePath.value = null;
  }

  /** 从结果中移除整个文件 */
  function dismissFile(filePath: string) {
    results.value.delete(filePath);
    triggerRef(results);
    const newExpanded = new Set(expandedFiles.value);
    newExpanded.delete(filePath);
    expandedFiles.value = newExpanded;
    if (selectedFilePath.value === filePath) {
      selectedFilePath.value = null;
    }
  }

  /** 对单个文件重新搜索，刷新匹配位置信息 */
  async function refreshFileResults(filePath: string) {
    if (!pattern.value) return;

    const request: ReplaceRequest = {
      filePaths: [filePath],
      pattern: pattern.value,
      replacement: replacement.value || "",
      isRegex: isRegex.value,
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
    };

    try {
      const freshResults = await invoke<FileSearchResult[]>("dir_replace_preview", { request });
      const map = results.value;

      if (freshResults.length > 0 && freshResults[0].matches.length > 0) {
        // 用新结果更新，保留原始的 relativePath
        const oldResult = map.get(filePath);
        map.set(filePath, {
          ...freshResults[0],
          relativePath: oldResult?.relativePath || freshResults[0].relativePath,
        });
      } else {
        // 该文件不再有匹配，移除
        map.delete(filePath);
        const newExpanded = new Set(expandedFiles.value);
        newExpanded.delete(filePath);
        expandedFiles.value = newExpanded;
        if (selectedFilePath.value === filePath) {
          selectedFilePath.value = null;
        }
      }

      triggerRef(results);
    } catch (e) {
      // 刷新失败时回退为简单移除该匹配
      errorHandler.warn(e, "刷新文件匹配信息失败");
    }
  }

  /** 执行单项精确替换 */
  async function replaceSingleMatch(filePath: string, matchIndex: number) {
    if (replacement.value === undefined) return null;

    const fileResult = results.value.get(filePath);
    if (!fileResult) return null;

    const match = fileResult.matches[matchIndex];
    if (!match) return null;

    const request: ReplaceSingleRequest = {
      filePath,
      lineNumber: match.lineNumber,
      matchStart: match.matchStart,
      matchEnd: match.matchEnd,
      replacement: replacement.value,
    };

    try {
      const result = await invoke<ReplaceSingleResult>("dir_replace_single", { request });
      if (result.success) {
        // 替换成功后重新搜索该文件，刷新所有匹配的位置信息
        await refreshFileResults(filePath);
      }
      return result;
    } catch (e) {
      errorHandler.error(e, "单项替换失败");
      return null;
    }
  }

  /** 从结果中移除单个匹配项 */
  function dismissMatch(filePath: string, matchIndex: number) {
    const fileResult = results.value.get(filePath);
    if (!fileResult) return;

    const newMatches = [...fileResult.matches];
    newMatches.splice(matchIndex, 1);

    if (newMatches.length === 0) {
      // 文件无匹配时自动移除文件
      dismissFile(filePath);
    } else {
      results.value.set(filePath, { ...fileResult, matches: newMatches });
      triggerRef(results);
    }
  }

  /** 选择文件进行预览 */
  function selectFile(filePath: string) {
    selectedFilePath.value = filePath;
  }

  // === 自动搜索门控 ===
  // 防止 UI 状态从持久化恢复时自动触发搜索
  // 只有在状态加载完成并经过一个 debounce 周期后才启用自动搜索
  const autoSearchReady = ref(uiState.isLoaded.value);

  if (!autoSearchReady.value) {
    const stopLoadWatch = watch(uiState.isLoaded, (loaded) => {
      if (loaded) {
        // 延迟启用：确保状态恢复触发的 debounced watch 已经被跳过
        setTimeout(() => {
          autoSearchReady.value = true;
        }, 350); // > debounce 300ms
        stopLoadWatch();
      }
    });
  }

  // === 自动搜索：输入即搜索，300ms 节流 ===
  // 将 rootPath 也纳入 debounced watch，避免状态恢复时重复触发
  watchDebounced(
    [pattern, rootPath, isRegex, caseSensitive, wholeWord, includeGlobs, excludeGlobs, useGitignore],
    () => {
      // 状态恢复期间不触发自动搜索
      if (!autoSearchReady.value) return;

      if (pattern.value && rootPath.value) {
        executeSearch();
      } else if (!pattern.value) {
        // 清空 pattern 时清空结果
        clearResults();
      }
    },
    { debounce: 300 },
  );

  /** 清理资源 */
  function dispose() {
    cleanupListeners();
  }

  return {
    // 搜索参数
    rootPath,
    pattern,
    replacement,
    isRegex,
    caseSensitive,
    wholeWord,
    includeGlobs,
    excludeGlobs,
    useGitignore,

    // 搜索状态
    isSearching,
    results,
    resultsList,
    summary,
    progress,
    totalMatches,
    totalFiles,

    // UI 状态
    showReplace,
    selectedFilePath,
    expandedFiles,

    // 历史记录
    searchHistory: uiState.searchHistory,
    replacementHistory: uiState.replacementHistory,
    directoryHistory: uiState.directoryHistory,
    includeHistory: uiState.includeHistory,
    excludeHistory: uiState.excludeHistory,

    // 方法
    executeSearch,
    cancelSearch,
    executeReplace,
    replaceSingleMatch,
    toggleFileExpand,
    expandAll,
    collapseAll,
    clearResults,
    dismissFile,
    dismissMatch,
    selectFile,
    dispose,
  };
}
