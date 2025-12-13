<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualList } from "@vueuse/core";
import { useAgentStore } from "../../agentStore";
import { useLlmChatStore } from "../../store";
import type { ChatSession } from "../../types";
import { Plus, Search } from "@element-plus/icons-vue";
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

// 过滤会话
const filteredSessions = computed(() => {
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

// 虚拟滚动列表
const { list, containerProps, wrapperProps } = useVirtualList(filteredSessions, {
  itemHeight: 50, // 更紧凑的高度
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
</script>

<template>
  <div class="mini-session-list">
    <div class="list-container" v-bind="filteredSessions.length > 0 ? containerProps : {}">
      <div v-if="chatStore.sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
      </div>
      <div v-else-if="filteredSessions.length === 0" class="empty-state">
        <p>无匹配结果</p>
      </div>

      <div v-else v-bind="wrapperProps">
        <div
          v-for="{ data: session } in list"
          :key="session.id"
          :class="['session-item', { active: session.id === chatStore.currentSessionId }]"
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
            <div class="session-meta">
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
      />
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
  height: 50px;
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
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.session-meta {
  display: flex;
  justify-content: flex-end;
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
