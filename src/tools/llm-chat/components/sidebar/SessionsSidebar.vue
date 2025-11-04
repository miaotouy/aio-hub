<script setup lang="ts">
import { computed, ref } from "vue";
import { useAgentStore } from "../../agentStore";
import type { ChatSession } from "../../types";
import {
  Plus,
  Delete,
  Search,
  MoreFilled,
  Edit,
  MagicStick,
  Operation,
} from "@element-plus/icons-vue";
import Avatar from "@/components/common/Avatar.vue";
import { useTopicNamer } from "../../composables/useTopicNamer";
import { useSessionManager } from "../../composables/useSessionManager";
import { customMessage } from "@/utils/customMessage";
import ExportSessionDialog from "../export/ExportSessionDialog.vue";

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

interface Emits {
  (e: "switch", sessionId: string): void;
  (e: "delete", sessionId: string): void;
  (e: "new-session", data: { agentId: string; name?: string }): void;
  (e: "rename", data: { sessionId: string; newName: string }): void;
  (e: "session-updated"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const searchQuery = ref("");
const { generateTopicName, isGenerating } = useTopicNamer();
const { persistSession } = useSessionManager();

// 排序和筛选相关状态
type SortBy = "updatedAt" | "createdAt" | "messageCount" | "name";
type SortOrder = "desc" | "asc";
type TimeFilter = "all" | "today" | "week" | "month" | "older";

const sortBy = ref<SortBy>("updatedAt");
const sortOrder = ref<SortOrder>("desc");
const filterAgent = ref<string>("all"); // 'all' 或特定的 agentId
const filterTime = ref<TimeFilter>("all");

// 重命名相关状态
const renameDialogVisible = ref(false);
const renamingSession = ref<ChatSession | null>(null);
const newSessionName = ref("");

// 导出会话相关状态
const exportSessionDialogVisible = ref(false);
const sessionToExport = ref<ChatSession | null>(null);

// 快速新建会话
const handleQuickNewSession = () => {
  // 使用当前选中的智能体，或使用默认智能体
  const agentId = agentStore.currentAgentId || agentStore.defaultAgent?.id;
  if (!agentId) {
    alert("没有可用的智能体来创建新会话");
    return;
  }
  emit("new-session", { agentId });
};

// 计算可用的智能体列表（用于筛选）
const availableAgents = computed(() => {
  const agentIds = new Set<string>();
  props.sessions.forEach((session) => {
    if (session.displayAgentId) {
      agentIds.add(session.displayAgentId);
    }
  });
  return Array.from(agentIds)
    .map((id) => agentStore.getAgentById(id))
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null);
});

// 时间筛选逻辑
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

// 智能体筛选逻辑
const filterByAgent = (sessions: ChatSession[]) => {
  if (filterAgent.value === "all") return sessions;
  return sessions.filter((session) => session.displayAgentId === filterAgent.value);
};

// 排序逻辑
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
        comparison = getMessageCount(b) - getMessageCount(a);
        break;
      case "name":
        comparison = a.name.localeCompare(b.name, "zh-CN");
        break;
    }

    return sortOrder.value === "desc" ? comparison : -comparison;
  });
};

// 合并所有筛选和排序
const filteredSessions = computed(() => {
  let sessions = props.sessions;

  // 1. 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    sessions = sessions.filter((session) => session.name.toLowerCase().includes(query));
  }

  // 2. 智能体筛选
  sessions = filterByAgent(sessions);

  // 3. 时间筛选
  sessions = filterByTime(sessions);

  // 4. 排序
  sessions = sortSessions(sessions);

  return sessions;
});

// 检查是否有活动的筛选
const hasActiveFilters = computed(() => {
  return (
    sortBy.value !== "updatedAt" ||
    sortOrder.value !== "desc" ||
    filterAgent.value !== "all" ||
    filterTime.value !== "all"
  );
});

// 重置筛选
const resetFilters = () => {
  sortBy.value = "updatedAt";
  sortOrder.value = "desc";
  filterAgent.value = "all";
  filterTime.value = "all";
};

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

// 获取会话当前显示的智能体信息
const getSessionDisplayAgent = (session: ChatSession) => {
  if (!session.displayAgentId) return null;
  return agentStore.getAgentById(session.displayAgentId);
};

// 确认删除
const confirmDelete = (session: ChatSession) => {
  if (confirm(`确定要删除对话"${session.name}"吗？`)) {
    emit("delete", session.id);
  }
};

// 打开重命名对话框
const openRenameDialog = (session: ChatSession) => {
  renamingSession.value = session;
  newSessionName.value = session.name;
  renameDialogVisible.value = true;
};

// 确认重命名
const confirmRename = () => {
  if (!renamingSession.value) return;

  const trimmedName = newSessionName.value.trim();
  if (!trimmedName) {
    alert("会话名称不能为空");
    return;
  }

  if (trimmedName === renamingSession.value.name) {
    renameDialogVisible.value = false;
    return;
  }

  emit("rename", {
    sessionId: renamingSession.value.id,
    newName: trimmedName,
  });

  renameDialogVisible.value = false;
  renamingSession.value = null;
  newSessionName.value = "";
};

// 取消重命名
const cancelRename = () => {
  renameDialogVisible.value = false;
  renamingSession.value = null;
  newSessionName.value = "";
};

// 生成标题
const handleGenerateName = async (session: ChatSession) => {
  try {
    const result = await generateTopicName(session, (updatedSession, currentSessionId) => {
      persistSession(updatedSession, currentSessionId);
    });

    if (result) {
      customMessage.success(`标题已生成：${result}`);
      emit("session-updated");
    }
  } catch (error) {
    // 错误已由 useTopicNamer 内部处理
  }
};

// 打开导出会话对话框
const openExportDialog = (session: ChatSession) => {
  sessionToExport.value = session;
  exportSessionDialogVisible.value = true;
};

// 处理菜单命令
const handleMenuCommand = (
  command: "delete" | "rename" | "generate-name" | "export",
  session: ChatSession
) => {
  if (command === "delete") {
    confirmDelete(session);
  } else if (command === "rename") {
    openRenameDialog(session);
  } else if (command === "generate-name") {
    handleGenerateName(session);
  } else if (command === "export") {
    openExportDialog(session);
  }
};

// 处理筛选菜单命令
const handleFilterCommand = (command: string) => {
  if (command === "reset") {
    resetFilters();
    return;
  }

  const [type, value] = command.split(":");

  switch (type) {
    case "sort":
      sortBy.value = value as SortBy;
      break;
    case "time":
      filterTime.value = value as TimeFilter;
      break;
    case "agent":
      filterAgent.value = value;
      break;
  }
};
</script>

<template>
  <div class="sessions-sidebar">
    <div class="sessions-sidebar-header">
      <div class="header-top">
        <el-input v-model="searchQuery" placeholder="搜索会话..." :prefix-icon="Search" clearable />
        <el-dropdown trigger="click" @command="handleFilterCommand">
          <el-button
            :icon="Operation"
            circle
            title="排序与筛选"
            :type="hasActiveFilters ? 'primary' : undefined"
          />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item divided disabled>排序方式</el-dropdown-item>
              <el-dropdown-item
                :class="{ 'is-active': sortBy === 'updatedAt' }"
                command="sort:updatedAt"
              >
                最近更新
              </el-dropdown-item>
              <el-dropdown-item
                :class="{ 'is-active': sortBy === 'createdAt' }"
                command="sort:createdAt"
              >
                创建时间
              </el-dropdown-item>
              <el-dropdown-item
                :class="{ 'is-active': sortBy === 'messageCount' }"
                command="sort:messageCount"
              >
                消息数量
              </el-dropdown-item>
              <el-dropdown-item :class="{ 'is-active': sortBy === 'name' }" command="sort:name">
                名称 (A-Z)
              </el-dropdown-item>

              <el-dropdown-item divided disabled>时间范围</el-dropdown-item>
              <el-dropdown-item :class="{ 'is-active': filterTime === 'all' }" command="time:all">
                全部
              </el-dropdown-item>
              <el-dropdown-item
                :class="{ 'is-active': filterTime === 'today' }"
                command="time:today"
              >
                今天
              </el-dropdown-item>
              <el-dropdown-item :class="{ 'is-active': filterTime === 'week' }" command="time:week">
                本周
              </el-dropdown-item>
              <el-dropdown-item
                :class="{ 'is-active': filterTime === 'month' }"
                command="time:month"
              >
                本月
              </el-dropdown-item>
              <el-dropdown-item
                :class="{ 'is-active': filterTime === 'older' }"
                command="time:older"
              >
                更早
              </el-dropdown-item>

              <el-dropdown-item v-if="availableAgents.length > 0" divided disabled>
                智能体
              </el-dropdown-item>
              <el-dropdown-item
                v-if="availableAgents.length > 0"
                :class="{ 'is-active': filterAgent === 'all' }"
                command="agent:all"
              >
                全部
              </el-dropdown-item>
              <el-dropdown-item
                v-for="agent in availableAgents"
                :key="agent.id"
                :class="{ 'is-active': filterAgent === agent.id }"
                :command="`agent:${agent.id}`"
              >
                {{ agent.name }}
              </el-dropdown-item>

              <el-dropdown-item v-if="hasActiveFilters" divided command="reset">
                重置筛选
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
          <div class="session-title">
            <el-tooltip
              v-if="getSessionDisplayAgent(session)"
              :content="`当前使用: ${getSessionDisplayAgent(session)?.name}`"
              placement="top"
              :show-after="500"
            >
              <Avatar
                :src="getSessionDisplayAgent(session)?.icon || ''"
                :alt="getSessionDisplayAgent(session)?.name"
                :size="20"
                shape="square"
                :radius="4"
              />
            </el-tooltip>
            <span :class="['title-text', { generating: isGenerating(session.id) }]">
              {{ session.name }}
            </span>
          </div>
          <div class="session-info">
            <span class="message-count">{{ getMessageCount(session) }} 条</span>
            <span class="session-time">{{ formatDate(session.updatedAt) }}</span>
            <el-dropdown
              @command="handleMenuCommand($event, session)"
              trigger="click"
              @click.stop
              class="menu-dropdown"
            >
              <el-button :icon="MoreFilled" size="small" text class="btn-menu" title="更多操作" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    command="generate-name"
                    :icon="MagicStick"
                    :disabled="isGenerating(session.id)"
                  >
                    {{ isGenerating(session.id) ? "生成中..." : "生成标题" }}
                  </el-dropdown-item>
                  <el-dropdown-item command="rename" :icon="Edit"> 重命名 </el-dropdown-item>
                  <el-dropdown-item command="export" :icon="Operation"> 导出会话 </el-dropdown-item>
                  <el-dropdown-item command="delete" :icon="Delete"> 删除会话 </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- 重命名对话框 -->
    <el-dialog v-model="renameDialogVisible" title="重命名会话" width="400px" @close="cancelRename">
      <el-input
        v-model="newSessionName"
        placeholder="请输入新的会话名称"
        maxlength="100"
        show-word-limit
        @keyup.enter="confirmRename"
        autofocus
      />
      <template #footer>
        <el-button @click="cancelRename">取消</el-button>
        <el-button type="primary" @click="confirmRename">确定</el-button>
      </template>
    </el-dialog>

    <!-- 导出会话对话框 -->
    <ExportSessionDialog
      v-model:visible="exportSessionDialogVisible"
      :session="sessionToExport"
    />
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
  padding: 4px 0;
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
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  position: relative;
}

/* 生成中的标题 - 扫光动画 */
.title-text.generating {
  background: linear-gradient(
    90deg,
    var(--text-color) 0%,
    var(--text-color) 40%,
    var(--primary-color) 50%,
    var(--text-color) 60%,
    var(--text-color) 100%
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 2s infinite linear;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 为生成中的会话项添加微妙的脉动效果 */
.session-item:has(.title-text.generating) {
  animation: pulse-border 2s infinite ease-in-out;
}

@keyframes pulse-border {
  0%,
  100% {
    border-color: var(--border-color);
  }
  50% {
    border-color: var(--primary-color);
    box-shadow: 0 0 8px rgba(var(--primary-color-rgb), 0.3);
  }
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

/* 筛选菜单活动项样式 */
:deep(.el-dropdown-menu__item.is-active) {
  color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.1);
}
</style>
