/**
 * useLlmSearch - LLM 聊天数据搜索组合式函数
 *
 * 封装对后端 search_llm_data 命令的调用，提供智能体和会话的全文搜索功能。
 */

import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useDebounceFn } from "@vueuse/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/useLlmSearch");
const errorHandler = createModuleErrorHandler("llm-chat/useLlmSearch");

// --- 类型定义 ---

/** 匹配详情 */
export interface MatchDetail {
  /** 匹配的字段名 */
  field: "name" | "displayName" | "description" | "presetMessage" | "presetMessageName" | "content" | "reasoningContent";
  /** 包含匹配项的上下文片段 */
  context: string;
  /** 消息角色（仅在消息匹配时存在） */
  role?: string;
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

/** 搜索选项 */
export interface SearchOptions {
  /** 最大结果数量，默认 50 */
  limit?: number;
  /** 防抖延迟（毫秒），默认 300 */
  debounceMs?: number;
}

// --- 组合式函数 ---

/**
 * LLM 聊天数据搜索
 *
 * @param options 搜索选项
 * @returns 搜索状态和方法
 */
export function useLlmSearch(options: SearchOptions = {}) {
  const { limit = 50, debounceMs = 300 } = options;

  // 搜索状态
  const isSearching = ref(false);
  const searchResults = ref<SearchResult[]>([]);
  const searchError = ref<string | null>(null);
  const lastQuery = ref("");

  // 按类型分组的结果
  const agentResults = computed(() => searchResults.value.filter((r) => r.kind === "agent"));
  const sessionResults = computed(() => searchResults.value.filter((r) => r.kind === "session"));

  /**
   * 执行搜索（内部方法）
   */
  const executeSearch = async (query: string): Promise<SearchResult[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    try {
      const results = await invoke<SearchResult[]>("search_llm_data", {
        query: trimmedQuery,
        limit,
      });

      logger.debug("搜索完成", { query: trimmedQuery, resultCount: results.length });
      return results;
    } catch (error) {
      errorHandler.error(error, "搜索失败");
      throw error;
    }
  };

  /**
   * 搜索（带防抖）
   */
  const debouncedSearch = useDebounceFn(async (query: string) => {
    const trimmedQuery = query.trim();
    lastQuery.value = trimmedQuery;

    if (!trimmedQuery) {
      searchResults.value = [];
      searchError.value = null;
      isSearching.value = false;
      return;
    }

    isSearching.value = true;
    searchError.value = null;

    try {
      searchResults.value = await executeSearch(trimmedQuery);
    } catch (error) {
      searchError.value = error instanceof Error ? error.message : "搜索失败";
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }, debounceMs);

  /**
   * 触发搜索
   */
  const search = (query: string) => {
    // 如果查询为空，立即清空结果
    if (!query.trim()) {
      searchResults.value = [];
      searchError.value = null;
      isSearching.value = false;
      lastQuery.value = "";
      return;
    }

    // 设置搜索中状态（用于显示加载指示器）
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
      searchResults.value = [];
      searchError.value = null;
      return [];
    }

    isSearching.value = true;
    searchError.value = null;

    try {
      const results = await executeSearch(trimmedQuery);
      searchResults.value = results;
      return results;
    } catch (error) {
      searchError.value = error instanceof Error ? error.message : "搜索失败";
      searchResults.value = [];
      return [];
    } finally {
      isSearching.value = false;
    }
  };

  /**
   * 清空搜索结果
   */
  const clearSearch = () => {
    searchResults.value = [];
    searchError.value = null;
    lastQuery.value = "";
    isSearching.value = false;
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

  return {
    // 状态
    isSearching,
    searchResults,
    searchError,
    lastQuery,
    agentResults,
    sessionResults,

    // 方法
    search,
    searchImmediate,
    clearSearch,

    // 辅助方法
    getFieldLabel,
    getRoleLabel,
  };
}

// 导出类型
export type UseLlmSearchReturn = ReturnType<typeof useLlmSearch>;