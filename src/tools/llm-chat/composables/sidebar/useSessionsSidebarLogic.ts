import { ref, computed, watch } from "vue";
import type { ChatSession } from "../../types";
import { useAgentStore } from "../../stores/agentStore";
import { useLlmSearch } from "../../composables/chat/useLlmSearch";
import { useTopicNamer } from "../../composables/chat/useTopicNamer";
import { useSessionManager } from "../../composables/session/useSessionManager";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import type { SortBy, SortOrder, TimeFilter } from "../../components/sidebar/FilterPanel.vue";

interface SidebarEmits {
  (e: "switch", sessionId: string): void;
  (e: "delete", sessionId: string): void;
  (e: "new-session", data: { agentId: string; name?: string }): void;
  (e: "rename", data: { sessionId: string; newName: string }): void;
  (e: "session-updated"): void;
}

interface UseSessionsSidebarLogicOptions {
  props: {
    sessions: ChatSession[];
    currentSessionId: string | null;
  };
  emit: SidebarEmits;
}

export function useSessionsSidebarLogic({ props, emit }: UseSessionsSidebarLogicOptions) {
  const agentStore = useAgentStore();
  const searchQuery = ref("");
  const { generateTopicName, isGenerating } = useTopicNamer();
  const { persistSession } = useSessionManager();
  const { settings } = useChatSettings();

  // 后端搜索功能
  const {
    isSearching,
    showLoadingIndicator,
    sessionResults,
    search,
    clearSearch,
    getFieldLabel,
    getRoleLabel,
  } = useLlmSearch({ debounceMs: 300, scope: "session" });

  // 搜索结果 ID 到匹配详情的映射
  const searchMatchesMap = computed(() => {
    const map = new Map<string, any>();
    for (const result of sessionResults.value) {
      map.set(result.id, result.matches);
    }
    return map;
  });

  const isInSearchMode = computed(() => searchQuery.value.trim().length >= 2);

  watch(searchQuery, (newQuery) => {
    const trimmed = newQuery.trim();
    if (trimmed.length >= 2) {
      search(trimmed);
    } else {
      clearSearch();
    }
  });

  // 排序和筛选相关状态
  const sortBy = ref<SortBy>("updatedAt");
  const sortOrder = ref<SortOrder>("desc");
  const filterAgent = ref<string>("all");
  const filterTime = ref<TimeFilter>("all");

  // 重命名相关状态
  const renameDialogVisible = ref(false);
  const renamingSession = ref<ChatSession | null>(null);
  const newSessionName = ref("");

  const handleQuickNewSession = () => {
    const agentId = agentStore.currentAgentId || agentStore.defaultAgent?.id;
    if (!agentId) {
      customMessage.warning("没有可用的智能体来创建新会话");
      return;
    }
    emit("new-session", { agentId });
  };

  const availableAgents = computed(() => {
    const agentIds = new Set<string>();
    props.sessions.forEach((session) => {
      if (session.displayAgentId) {
        agentIds.add(session.displayAgentId);
      }
    });
    return Array.from(agentIds)
      .map((id) => agentStore.getAgentById(id))
      .filter((agent): agent is NonNullable<typeof agent> => !!agent);
  });

  const filterByTime = (sessions: ChatSession[]) => {
    if (filterTime.value === "all") return sessions;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return sessions.filter((session) => {
      const updatedAt = new Date(session.updatedAt);
      switch (filterTime.value) {
        case "today":
          return updatedAt >= today;
        case "week":
          return updatedAt >= weekAgo && updatedAt < today;
        case "month":
          return updatedAt >= monthAgo && updatedAt < weekAgo;
        case "older":
          return updatedAt < monthAgo;
        default:
          return true;
      }
    });
  };

  const filterByAgent = (sessions: ChatSession[]) => {
    if (filterAgent.value === "all") return sessions;
    return sessions.filter((session) => session.displayAgentId === filterAgent.value);
  };

  const sortSessions = (sessions: ChatSession[]) => {
    return [...sessions].sort((a, b) => {
      let comparison = 0;
      switch (sortBy.value) {
        case "updatedAt":
          comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          break;
        case "createdAt":
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case "messageCount":
          comparison = (b.messageCount ?? 0) - (a.messageCount ?? 0);
          break;
        case "name":
          comparison = a.name.localeCompare(b.name, "zh-CN");
          break;
      }
      return sortOrder.value === "desc" ? comparison : -comparison;
    });
  };

  const filteredSessions = computed(() => {
    let sessions = props.sessions;
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase();
      sessions = sessions.filter((session) => session.name.toLowerCase().includes(query));
    }
    sessions = filterByAgent(sessions);
    sessions = filterByTime(sessions);
    sessions = sortSessions(sessions);
    return sessions;
  });

  const searchResultSessions = computed(() => {
    if (!isInSearchMode.value) return [];
    const sessions: ChatSession[] = [];
    const sessionMap = new Map(props.sessions.map((s) => [s.id, s]));
    for (const result of sessionResults.value) {
      const session = sessionMap.get(result.id);
      if (session) {
        if (filterAgent.value === "all" || session.displayAgentId === filterAgent.value) {
          sessions.push(session);
        }
      }
    }
    return sessions;
  });

  const displaySessions = computed(() => {
    if (isInSearchMode.value) {
      if (searchResultSessions.value.length > 0) return searchResultSessions.value;
      if (isSearching.value) return filteredSessions.value;
      return [];
    }
    return filteredSessions.value;
  });

  const hasActiveFilters = computed(() => {
    return (
      sortBy.value !== "updatedAt" ||
      sortOrder.value !== "desc" ||
      filterAgent.value !== "all" ||
      filterTime.value !== "all"
    );
  });

  const resetFilters = () => {
    sortBy.value = "updatedAt";
    sortOrder.value = "desc";
    filterAgent.value = "all";
    filterTime.value = "all";
  };

  const confirmDelete = (session: ChatSession) => {
    ElMessageBox.confirm(`确定要删除对话"${session.name}"吗？`, "删除会话", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    })
      .then(() => {
        emit("delete", session.id);
      })
      .catch(() => {});
  };

  const openRenameDialog = (session: ChatSession) => {
    renamingSession.value = session;
    newSessionName.value = session.name;
    renameDialogVisible.value = true;
  };

  const handleGenerateName = async (session: ChatSession) => {
    const result = await generateTopicName(session, (updatedSession, currentSessionId) => {
      persistSession(updatedSession, currentSessionId);
    });
    if (result) {
      customMessage.success(`标题已生成：${result}`);
      emit("session-updated");
    }
  };

  return {
    searchQuery,
    isSearching,
    showLoadingIndicator,
    displaySessions,
    isInSearchMode,
    sortBy,
    sortOrder,
    filterAgent,
    filterTime,
    renameDialogVisible,
    renamingSession,
    newSessionName,
    availableAgents,
    hasActiveFilters,
    searchMatchesMap,
    isGenerating,
    handleQuickNewSession,
    resetFilters,
    confirmDelete,
    openRenameDialog,
    handleGenerateName,
    getFieldLabel,
    getRoleLabel,
    settings,
    agentStore,
  };
}
