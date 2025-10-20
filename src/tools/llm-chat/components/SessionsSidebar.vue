<script setup lang="ts">
import { computed, ref } from "vue";
import { useAgentStore } from "../agentStore";
import type { ChatSession } from "../types";
import { Plus, Delete, Search, MoreFilled } from "@element-plus/icons-vue";

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentAgentId: string; // 当前激活的智能体ID
}

interface Emits {
  (e: "switch", sessionId: string): void;
  (e: "delete", sessionId: string): void;
  (e: "new-session", data: { agentId: string; name?: string }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const searchQuery = ref("");

// 快速新建会话
const handleQuickNewSession = () => {
  // 优先使用当前会话的智能体，否则使用默认智能体
  const agentId = props.currentAgentId || agentStore.defaultAgent?.id;
  if (!agentId) {
    alert("没有可用的智能体来创建新会话");
    return;
  }
  emit("new-session", { agentId });
};

// 按更新时间倒序排列
const sortedSessions = computed(() => {
  return [...props.sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

// 搜索过滤
const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) {
    return sortedSessions.value;
  }
  const query = searchQuery.value.toLowerCase();
  return sortedSessions.value.filter((session) => session.name.toLowerCase().includes(query));
});

// 格式化日期
const formatDate = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
};

// 获取消息数量（排除系统根节点）
const getMessageCount = (session: ChatSession) => {
  return Object.keys(session.nodes).length - 1;
};

// 确认删除
const confirmDelete = (session: ChatSession) => {
  if (confirm(`确定要删除对话"${session.name}"吗？`)) {
    emit("delete", session.id);
  }
};

// 处理菜单命令
const handleMenuCommand = (command: 'delete', session: ChatSession) => {
  if (command === 'delete') {
    confirmDelete(session);
  }
};
</script>

<template>
  <div class="sessions-sidebar">
    <div class="sessions-sidebar-header">
      <div class="header-top">
        <el-input v-model="searchQuery" placeholder="搜索会话..." :prefix-icon="Search" clearable />
        <el-button :icon="Plus" @click="handleQuickNewSession" title="新建对话" circle />
      </div>
    </div>

    <div class="session-count">{{ filteredSessions.length }} / {{ sessions.length }} 个会话</div>
    <div class="sessions-list">
      <div v-if="sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
        <p class="hint">点击上方 "+" 按钮创建新会话</p>
      </div>

      <div v-else-if="filteredSessions.length === 0" class="empty-state">
        <p>未找到匹配的会话</p>
      </div>

      <div
        v-for="session in filteredSessions"
        :key="session.id"
        :class="['session-item', { active: session.id === currentSessionId }]"
        @click="emit('switch', session.id)"
      >
        <div class="session-content">
          <div class="session-title">{{ session.name }}</div>
          <div class="session-info">
            <span class="message-count">{{ getMessageCount(session) }} 条</span>
            <span class="session-time">{{ formatDate(session.updatedAt) }}</span>
            <el-dropdown
              @command="handleMenuCommand($event, session)"
              trigger="click"
              @click.stop
              class="menu-dropdown"
            >
              <el-button
                :icon="MoreFilled"
                size="small"
                text
                class="btn-menu"
                title="更多操作"
              />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="delete" :icon="Delete">
                    删除会话
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sessions-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
}

.sessions-sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
}

.header-top {
  display: flex;
  gap: 8px;
  align-items: center;
}

.session-count {
  margin: 0;
  padding: 8px 0;
  font-size: 12px;
  color: var(--text-color-light);
  text-align: center;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.session-item:hover {
  background-color: var(--hover-bg);
  border-color: var(--border-color);
}

.session-item.active {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-color: var(--primary-color);
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.menu-dropdown {
  margin-left: auto;
}

.message-count {
  background-color: var(--container-bg);
  padding: 1px 6px;
  border-radius: 3px;
}

.btn-menu {
  opacity: 0;
  transition: all 0.2s;
}

.session-item:hover .btn-menu {
  opacity: 1;
}

/* 滚动条样式 */
.sessions-list::-webkit-scrollbar {
  width: 6px;
}

.sessions-list::-webkit-scrollbar-track {
  background: transparent;
}

.sessions-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.sessions-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
