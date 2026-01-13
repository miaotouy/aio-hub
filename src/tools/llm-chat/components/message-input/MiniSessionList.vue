<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVirtualList } from "@vueuse/core";
import { useAgentStore } from "../../stores/agentStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import type { ChatSession } from "../../types";
import { useLlmSearch } from "../../composables/useLlmSearch";
import { Plus, Search, Loading } from "@element-plus/icons-vue";
import Avatar from "@/components/common/Avatar.vue";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";
import { formatRelativeTime } from "@/utils/time";
import { useChatSettings } from "../../composables/useChatSettings";

interface Emits {
  (e: "switch", sessionId: string): void;
  (e: "new-session"): void;
}

const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const chatStore = useLlmChatStore();
const searchQuery = ref("");
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

// 是否处于搜索模式（有搜索词且长度>=2）
const isInSearchMode = computed(() => searchQuery.value.trim().length >= 2);

// 监听搜索词变化
watch(searchQuery, (newQuery) => {
  const trimmed = newQuery.trim();
  if (trimmed.length >= 2) {
    search(trimmed);
  } else {
    clearSearch();
  }
});

// 本地过滤和排序逻辑（用于非搜索模式或过渡）
const localFilteredSessions = computed(() => {
  let result = chatStore.sessions;

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter((session) => session.name.toLowerCase().includes(query));
  }

  // 默认按更新时间降序排序
  return [...result].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
});

// 搜索模式下的会话列表（基于后端搜索结果）
const searchResultSessions = computed(() => {
  if (!isInSearchMode.value) return [];

  const sessions: ChatSession[] = [];
  const sessionMap = new Map(chatStore.sessions.map((s) => [s.id, s]));

  for (const result of sessionResults.value) {
    const session = sessionMap.get(result.id);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
});

// 最终显示的会话列表
const displaySessions = computed(() => {
  if (isInSearchMode.value) {
    if (searchResultSessions.value.length > 0) {
      return searchResultSessions.value;
    }
    // 正在搜索时，显示前端过滤结果作为过渡
    if (isSearching.value) {
      return localFilteredSessions.value;
    }
    return [];
  }
  return localFilteredSessions.value;
});

// 搜索结果 ID 到匹配详情的映射
const searchMatchesMap = computed(() => {
  const map = new Map<string, any[]>();
  for (const result of sessionResults.value) {
    map.set(result.id, result.matches);
  }
  return map;
});

// 获取 session 的匹配详情
const getSessionMatches = (sessionId: string) => {
  if (!isInSearchMode.value) return undefined;
  const matches = searchMatchesMap.value.get(sessionId);
  if (!matches) return undefined;
  // 过滤掉名称匹配，因为名称已经显示在标题中了
  return matches.filter((m) => m.field !== "name");
};

// 虚拟滚动列表
const { list, containerProps, wrapperProps } = useVirtualList(displaySessions, {
  itemHeight: (index) => {
    const session = displaySessions.value[index];
    if (!session) return 50;
    const matches = getSessionMatches(session.id);
    // 如果有搜索匹配详情，增加高度
    if (matches && matches.length > 0) {
      return 50 + Math.min(matches.length, 2) * 16 + 4;
    }
    return 50;
  },
});

// 获取会话当前显示的智能体信息
const getSessionDisplayAgent = (session: ChatSession) => {
  if (!session.displayAgentId) return null;
  return agentStore.getAgentById(session.displayAgentId);
};

// 处理会话点击
const handleSessionClick = (session: ChatSession) => {
  if (settings.value.uiPreferences.autoSwitchAgentOnSessionChange && session.displayAgentId) {
    const agent = agentStore.getAgentById(session.displayAgentId);
    if (agent) {
      agentStore.selectAgent(session.displayAgentId);
    }
  }
  emit("switch", session.id);
};

const handleNewSession = () => {
  emit("new-session");
};

// 获取消息数量（排除系统根节点）
const getMessageCount = (session: ChatSession) => {
  return Object.keys(session.nodes).length - 1;
};
</script>

<template>
  <div class="mini-session-list">
    <div class="list-container" v-bind="displaySessions.length > 0 ? containerProps : {}">
      <div v-if="chatStore.sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
      </div>
      <div v-else-if="displaySessions.length === 0" class="empty-state">
        <p>无匹配结果</p>
      </div>

      <div v-else v-bind="wrapperProps">
        <div
          v-for="{ data: session } in list"
          :key="session.id"
          :class="[
            'session-item',
            {
              active: session.id === chatStore.currentSessionId,
              'has-matches': getSessionMatches(session.id)?.length,
            },
          ]"
          :style="{ height: 'auto', minHeight: '50px' }"
          @click="handleSessionClick(session)"
        >
          <div class="session-content">
            <div class="session-title-row">
              <Avatar
                v-if="getSessionDisplayAgent(session)"
                :src="resolveAvatarPath(getSessionDisplayAgent(session), 'agent') || ''"
                :alt="getSessionDisplayAgent(session)?.name"
                :size="16"
                shape="square"
                :radius="3"
                class="agent-avatar"
              />
              <span class="session-title">{{ session.name }}</span>
            </div>

            <!-- 搜索匹配详情 -->
            <div v-if="getSessionMatches(session.id)?.length" class="match-details">
              <div
                v-for="(match, index) in getSessionMatches(session.id)!.slice(0, 2)"
                :key="index"
                class="match-item"
              >
                <span class="match-field"
                  >{{ getFieldLabel(match.field)
                  }}{{ match.role ? `(${getRoleLabel(match.role)})` : "" }}:</span
                >
                <span class="match-context" :title="match.context">{{ match.context }}</span>
              </div>
            </div>

            <div class="session-meta">
              <span class="message-count">{{ getMessageCount(session) }} 条</span>
              <span class="session-time">{{ formatRelativeTime(session.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="header">
      <el-tooltip content="新建对话" placement="top" :show-after="500">
        <el-button :icon="Plus" size="small" circle @click="handleNewSession" />
      </el-tooltip>
      <el-input
        v-model="searchQuery"
        placeholder="搜索会话..."
        :prefix-icon="Search"
        size="small"
        clearable
        class="search-input"
      >
        <template #suffix v-if="showLoadingIndicator">
          <el-icon class="is-loading"><Loading /></el-icon>
        </template>
      </el-input>
    </div>
  </div>
</template>

<style scoped>
.mini-session-list {
  display: flex;
  flex-direction: column;
  height: 300px;
  width: 100%;
}

.header {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  align-items: center;
}

.search-input {
  flex: 1;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  color: var(--text-color-light);
  font-size: 12px;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 2px;
  min-height: 50px;
  box-sizing: border-box;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.session-item:hover {
  background-color: var(--hover-bg);
}

.session-item.active {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-color: rgba(var(--primary-color-rgb), 0.2);
}

.session-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-avatar {
  flex-shrink: 0;
  opacity: 0.8;
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.match-details {
  margin: 2px 0;
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.match-item {
  display: flex;
  gap: 4px;
  align-items: baseline;
  min-width: 0;
}

.match-field {
  flex-shrink: 0;
  color: var(--text-color-light);
  font-size: 10px;
}

.match-context {
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.session-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.message-count {
  font-size: 10px;
  color: var(--text-color-light);
  background-color: var(--container-bg);
  padding: 0px 4px;
  border-radius: 3px;
  opacity: 0.8;
}

.session-time {
  font-size: 11px;
  color: var(--text-color-light);
}

/* Scrollbar styling */
.list-container::-webkit-scrollbar {
  width: 4px;
}

.list-container::-webkit-scrollbar-track {
  background: transparent;
}

.list-container::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 2px;
}

.list-container::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
