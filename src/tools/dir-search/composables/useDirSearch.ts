import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { watchDebounced } from "@vueuse/core";
import type {
  FileSearchResult,
  SearchProgress,
  SearchSummary,
  SearchRequest,
  ReplaceRequest,
  ReplaceResult,
} from "../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("tools/dir-search/useDirSearch");

export function useDirSearch() {
  // 搜索参数
  const rootPath = ref("");
  const pattern = ref("");
  const replacement = ref("");
  const isRegex = ref(false);
  const caseSensitive = ref(false);
  const wholeWord = ref(false);
  const includeGlobs = ref("");
  const excludeGlobs = ref("");
  const useGitignore = ref(true);

  // 搜索状态
  const isSearching = ref(false);
  const results = ref<Map<string, FileSearchResult>>(new Map());
  const summary = ref<SearchSummary | null>(null);
  const progress = ref<SearchProgress | null>(null);

  // UI 状态
  const showReplace = ref(false);
  const selectedFilePath = ref<string | null>(null);
  const expandedFiles = ref<Set<string>>(new Set());

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

  /** 设置事件监听 */
  async function setupListeners() {
    // 清理旧监听
    await cleanupListeners();

    unlistenResult = await listen<FileSearchResult>("dir-search-result", (event) => {
      const result = event.payload;
      results.value.set(result.filePath, result);
      // 默认全部展开
      expandedFiles.value.add(result.filePath);
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
  }

  /** 执行搜索 */
  async function executeSearch() {
    if (!rootPath.value || !pattern.value) return;

    // 如果正在搜索，先取消上一次
    if (isSearching.value) {
      await cancelSearch();
      await cleanupListeners();
    }

    // 清空旧结果
    results.value = new Map();
    summary.value = null;
    progress.value = null;
    expandedFiles.value = new Set();
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
      maxResults: 10000,
    };

    try {
      const result = await invoke<SearchSummary>("dir_search", { request });
      summary.value = result;
    } catch (e) {
      errorHandler.error(e, "搜索执行失败");
    } finally {
      isSearching.value = false;
      await cleanupListeners();
    }
  }

  /** 取消搜索 */
  async function cancelSearch() {
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
    if (expandedFiles.value.has(filePath)) {
      expandedFiles.value.delete(filePath);
    } else {
      expandedFiles.value.add(filePath);
    }
  }

  /** 全部展开 */
  function expandAll() {
    for (const key of results.value.keys()) {
      expandedFiles.value.add(key);
    }
  }

  /** 全部折叠 */
  function collapseAll() {
    expandedFiles.value.clear();
  }

  /** 选择文件进行预览 */
  function selectFile(filePath: string) {
    selectedFilePath.value = filePath;
  }

  // === 自动搜索：输入即搜索，300ms 节流 ===
  watchDebounced(
    [pattern, isRegex, caseSensitive, wholeWord, includeGlobs, excludeGlobs, useGitignore],
    () => {
      if (pattern.value && rootPath.value) {
        executeSearch();
      } else if (!pattern.value) {
        // 清空 pattern 时清空结果
        results.value = new Map();
        summary.value = null;
        progress.value = null;
        expandedFiles.value = new Set();
      }
    },
    { debounce: 300 },
  );

  // rootPath 变化时，如果已有 pattern 则立即重新搜索
  watch(rootPath, (newPath) => {
    if (newPath && pattern.value) {
      executeSearch();
    }
  });

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

    // 方法
    executeSearch,
    cancelSearch,
    executeReplace,
    toggleFileExpand,
    expandAll,
    collapseAll,
    selectFile,
    dispose,
  };
}
