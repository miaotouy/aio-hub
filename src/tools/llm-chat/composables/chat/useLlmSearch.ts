/**
 * useLlmSearch - LLM 聊天数据搜索组合式函数
 * 封装对后端 search_llm_data_stream 命令的调用，提供智能体和会话的全文搜索功能。
 * 采用流式返回（Channel）机制，边搜边展示结果。
 */

import { ref, computed, unref } from "vue";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useDebounceFn } from "@vueuse/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useChatSettings } from "../../composables/settings/useChatSettings";

const logger = createModuleLogger("llm-chat/useLlmSearch");
const errorHandler = createModuleErrorHandler("llm-chat/useLlmSearch");

// --- 类型定义 ---

/** 流式 Payload 类型 */
type SearchStreamPayload =
  | { type: "progress"; data: { filesScanned: number; filesMatched: number } }
  | { type: "resultBatch"; data: SearchResult[] }
  | { type: "done"; data: { durationMs: number } };

/** 匹配详情 */
export interface MatchDetail {
  /** 匹配的字段名 */
  field:
    | "name"
    | "displayName"
    | "description"
    | "presetMessage"
    | "presetMessageName"
    | "content"
    | "reasoningContent";
  /** 包含匹配项的上下文片段 */
  context: string;
  /** 消息角色（仅在消息匹配时存在） */
  role?: string;
  /** 匹配项在 context 中的起止字节偏移 (start, end) */
  match_offsets: [number, number][];
}

/** 高亮片段 */
export interface HighlightPart {
  text: string;
  isMatch: boolean;
}

/** 搜索结果项 */
export interface SearchResult {
  /** 智能体或会话的 ID */
  id: string;
  /** 结果类型 */
  kind: "agent" | "session";
  /** 标题（智能体显示名或会话名） */
  title: string;
  /** 匹配详情列表 */
  matches: MatchDetail[];
  /** 更新时间 */
  updatedAt?: string;
  /** 文件相对路径 */
  path: string;
}

/** 搜索匹配模式 */
export type SearchMatchMode = "exact" | "and" | "or";

/** 搜索选项 */
export interface SearchOptions {
  /** 最大结果数量，默认 500 */
  limit?: number;
  /** 搜索范围：'agent' | 'session' | 'all' (默认) */
  scope?: "agent" | "session" | "all";
  /** 匹配模式：'exact' 整体匹配 | 'and' 全部包含 | 'or' 任一包含，默认 'exact' */
  matchMode?: SearchMatchMode;
  /** 防抖延迟（毫秒），默认 300 */
  debounceMs?: number;
  /** loading 显示延迟（毫秒）。用于避免短时间搜索时的闪烁 */
  loadingDelayMs?: number;
}

// --- 组合式函数 ---

/**
 * LLM 聊天数据搜索
 *
 * @param options 搜索选项
 * @returns 搜索状态和方法
 */
export function useLlmSearch(options: SearchOptions = {}) {
  const { settings } = useChatSettings();
  const {
    limit,
    scope = "all",
    matchMode: initialMatchMode = "exact",
    debounceMs = 300,
    loadingDelayMs = 300,
  } = options;

  const resolvedLimit = computed(
    () => limit ?? unref(settings).uiPreferences.searchResultLimit
  );

  // 搜索匹配模式（响应式，可由 UI 动态切换）
  const matchMode = ref<SearchMatchMode>(initialMatchMode);

  // 搜索状态
  const isSearching = ref(false); // 内部状态：是否正在搜索
  const showLoadingIndicator = ref(false); // 外部状态：是否显示 loading（带延迟）
  const searchResults = ref<SearchResult[]>([]);
  const searchError = ref<string | null>(null);
  const lastQuery = ref("");

  // 搜索进度
  const filesScanned = ref(0);
  const filesMatched = ref(0);

  // loading 延迟计时器
  let loadingDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSearchRunId = 0;
  let pendingCancelSearch: Promise<void> | null = null;

  // 按类型分组的结果
  const agentResults = computed(() =>
    searchResults.value.filter((r) => r.kind === "agent")
  );
  const sessionResults = computed(() =>
    searchResults.value.filter((r) => r.kind === "session")
  );

  /**
   * 清除 loading 延迟计时器
   */
  const clearLoadingTimer = () => {
    if (loadingDelayTimer) {
      clearTimeout(loadingDelayTimer);
      loadingDelayTimer = null;
    }
  };

  /**
   * 开始 loading 延迟计时
   */
  const startLoadingTimer = () => {
    clearLoadingTimer();
    loadingDelayTimer = setTimeout(() => {
      // 只有当仍在搜索时才显示 loading
      if (isSearching.value) {
        showLoadingIndicator.value = true;
      }
    }, loadingDelayMs);
  };

  /**
   * 取消当前搜索
   */
  const cancelSearch = async () => {
    try {
      await invoke("cancel_llm_chat_search");
    } catch (e) {
      // 取消命令失败通常无需处理
      logger.debug("取消搜索命令失败", { error: e });
    }
  };

  /**
   * 请求取消当前搜索，并复用尚未完成的取消请求，避免旧取消命令晚于新搜索抵达后端。
   */
  const requestCancelSearch = () => {
    if (!pendingCancelSearch) {
      pendingCancelSearch = cancelSearch().finally(() => {
        pendingCancelSearch = null;
      });
    }
    return pendingCancelSearch;
  };

  /**
   * 执行流式搜索（内部方法）
   */
  const executeSearchStream = async (query: string): Promise<void> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    const searchRunId = ++activeSearchRunId;

    // 清空旧结果
    searchResults.value = [];
    filesScanned.value = 0;
    filesMatched.value = 0;

    const channel = new Channel<SearchStreamPayload>();

    channel.onmessage = (payload) => {
      if (searchRunId !== activeSearchRunId) {
        return;
      }

      if (payload.type === "progress") {
        filesScanned.value = payload.data.filesScanned;
        filesMatched.value = payload.data.filesMatched;
      } else if (payload.type === "resultBatch") {
        // 合并并动态排序
        const merged = [...searchResults.value, ...payload.data];
        merged.sort((a, b) => {
          const countDiff = b.matches.length - a.matches.length;
          if (countDiff !== 0) return countDiff;
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        });
        searchResults.value = merged;
      } else if (payload.type === "done") {
        isSearching.value = false;
        showLoadingIndicator.value = false;
        clearLoadingTimer();
        logger.debug("流式搜索完成", {
          query: trimmedQuery,
          scope,
          durationMs: payload.data.durationMs,
          resultCount: searchResults.value.length,
        });
      }
    };

    try {
      if (pendingCancelSearch) {
        await pendingCancelSearch;
      }

      if (searchRunId !== activeSearchRunId) {
        return;
      }

      await invoke("search_llm_data_stream", {
        query: trimmedQuery,
        limit: resolvedLimit.value,
        scope,
        matchMode: matchMode.value,
        onEvent: channel,
      });
    } catch (error) {
      if (searchRunId !== activeSearchRunId) {
        return;
      }
      isSearching.value = false;
      showLoadingIndicator.value = false;
      clearLoadingTimer();
      searchError.value = error instanceof Error ? error.message : "搜索失败";
      errorHandler.error(error, "流式搜索失败");
    }
  };

  /**
   * 搜索（带防抖）
   */
  const debouncedSearch = useDebounceFn(async (query: string) => {
    const trimmedQuery = query.trim();
    lastQuery.value = trimmedQuery;

    if (!trimmedQuery) {
      activeSearchRunId++;
      requestCancelSearch();
      searchResults.value = [];
      searchError.value = null;
      isSearching.value = false;
      showLoadingIndicator.value = false;
      clearLoadingTimer();
      return;
    }

    if (isSearching.value) {
      await requestCancelSearch();
    }

    isSearching.value = true;
    searchError.value = null;
    // 启动 loading 延迟计时器
    startLoadingTimer();

    try {
      await executeSearchStream(trimmedQuery);
    } catch (error) {
      searchError.value = error instanceof Error ? error.message : "搜索失败";
    }
  }, debounceMs);

  /**
   * 触发搜索
   */
  const search = (query: string) => {
    // 如果查询为空，立即清空结果
    if (!query.trim()) {
      activeSearchRunId++;
      requestCancelSearch();
      searchResults.value = [];
      searchError.value = null;
      isSearching.value = false;
      showLoadingIndicator.value = false;
      lastQuery.value = "";
      clearLoadingTimer();
      return;
    }

    activeSearchRunId++;

    // 取消上一次未完成的搜索
    if (isSearching.value) {
      requestCancelSearch();
    }

    // 标记内部搜索状态，但不立即显示 loading（由延迟计时器控制）
    isSearching.value = true;
    debouncedSearch(query);
  };

  /**
   * 立即执行搜索（不防抖）
   */
  const searchImmediate = async (query: string) => {
    const trimmedQuery = query.trim();
    lastQuery.value = trimmedQuery;

    if (!trimmedQuery) {
      activeSearchRunId++;
      requestCancelSearch();
      searchResults.value = [];
      searchError.value = null;
      return [];
    }

    // 取消上一次未完成的搜索
    if (isSearching.value) {
      await requestCancelSearch();
    }

    isSearching.value = true;
    searchError.value = null;
    // 立即搜索也使用延迟显示 loading
    startLoadingTimer();

    try {
      await executeSearchStream(trimmedQuery);
      return searchResults.value;
    } catch (error) {
      searchError.value = error instanceof Error ? error.message : "搜索失败";
      return [];
    }
  };

  /**
   * 清空搜索结果
   */
  const clearSearch = () => {
    activeSearchRunId++;
    requestCancelSearch();
    searchResults.value = [];
    searchError.value = null;
    lastQuery.value = "";
    isSearching.value = false;
    showLoadingIndicator.value = false;
    filesScanned.value = 0;
    filesMatched.value = 0;
    clearLoadingTimer();
  };

  /**
   * 获取字段的友好名称
   */
  const getFieldLabel = (field: MatchDetail["field"]): string => {
    const labels: Record<MatchDetail["field"], string> = {
      name: "名称",
      displayName: "显示名称",
      description: "描述",
      presetMessage: "预设消息",
      presetMessageName: "预设消息名称",
      content: "消息内容",
      reasoningContent: "推理内容",
    };
    return labels[field] || field;
  };

  /**
   * 获取角色的友好名称
   */
  const getRoleLabel = (role?: string): string => {
    if (!role) return "";
    const labels: Record<string, string> = {
      user: "用户",
      assistant: "助手",
      system: "系统",
    };
    return labels[role] || role;
  };

  /**
   * 格式化搜索结果的上下文，进行智能截断和高亮标记
   * @param match 匹配详情
   * @param maxChars 最大显示字符数
   */
  const formatMatchContext = (
    match: MatchDetail,
    maxChars: number = 40
  ): HighlightPart[] => {
    const { context, match_offsets } = match;
    if (!match_offsets || match_offsets.length === 0) {
      return [{ text: context, isMatch: false }];
    }

    // 1. 确定"窗口"。以第一个匹配项为准
    const firstMatch = match_offsets[0];
    const matchStart = firstMatch[0];
    const matchEnd = firstMatch[1];
    const matchLen = matchEnd - matchStart;

    // 2. 计算截断范围
    // 侧边栏空间有限，前缀预留少一点，让高亮更靠前 (约 1/4 处)
    const prefixChars = Math.max(0, Math.floor(maxChars * 0.25));
    const suffixChars = Math.max(0, maxChars - matchLen - prefixChars);

    let startIdx = 0;
    let endIdx = context.length;
    let prefix = "";
    let suffix = "";

    // 向前截断
    if (matchStart > prefixChars) {
      startIdx = matchStart - prefixChars;
      prefix = "...";
    }

    // 向后截断
    if (context.length - matchEnd > suffixChars) {
      endIdx = matchEnd + suffixChars;
      suffix = "...";
    }

    const parts: HighlightPart[] = [];

    // 添加前缀
    if (prefix) {
      parts.push({ text: prefix, isMatch: false });
    }

    // 3. 在窗口内拆分高亮部分

    let lastPos = startIdx;

    // 过滤出在窗口内的偏移量
    const relevantOffsets = match_offsets
      .filter(([s, e]) => !(e <= startIdx || s >= endIdx))
      .map(([s, e]) => [Math.max(s, startIdx), Math.min(e, endIdx)]);

    for (const [s, e] of relevantOffsets) {
      if (s > lastPos) {
        parts.push({ text: context.substring(lastPos, s), isMatch: false });
      }
      parts.push({ text: context.substring(s, e), isMatch: true });
      lastPos = e;
    }

    if (lastPos < endIdx) {
      parts.push({ text: context.substring(lastPos, endIdx), isMatch: false });
    }

    // 添加后缀
    if (suffix) {
      parts.push({ text: suffix, isMatch: false });
    }

    return parts;
  };

  return {
    // 状态
    isSearching, // 内部搜索状态（用于逻辑判断）
    showLoadingIndicator, // 外部显示状态（用于 UI 显示，带延迟）
    searchResults,
    searchError,
    lastQuery,
    matchMode, // 搜索匹配模式（可读写）
    agentResults,
    sessionResults,
    filesScanned, // 已扫描文件数
    filesMatched, // 已匹配文件数

    // 方法
    search,
    searchImmediate,
    clearSearch,
    cancelSearch,

    // 辅助方法
    getFieldLabel,
    getRoleLabel,
    formatMatchContext,
  };
}

// 导出类型
export type UseLlmSearchReturn = ReturnType<typeof useLlmSearch>;
