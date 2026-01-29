<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useAgentStore } from "../../stores/agentStore";
import type { ChatSession } from "../../types";
import { useLlmSearch, type MatchDetail } from "../../composables/chat/useLlmSearch";
import {
  Plus,
  Delete,
  Search,
  MoreFilled,
  Edit,
  MagicStick,
  Operation,
  Loading,
  FolderOpened,
  Position,
} from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "@/components/common/Avatar.vue";
import { useTopicNamer } from "../../composables/chat/useTopicNamer";
import { useSessionManager } from "../../composables/session/useSessionManager";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useChatStorageSeparated } from "../../composables/storage/useChatStorageSeparated";
import { resolveAvatarPath } from "../../composables/ui/useResolvedAvatar";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import ExportSessionDialog from "../export/ExportSessionDialog.vue";
import { formatRelativeTime } from "@/utils/time";

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
  const map = new Map<string, MatchDetail[]>();
  for (const result of sessionResults.value) {
    map.set(result.id, result.matches);
  }
  return map;
});

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
    customMessage.warning("没有可用的智能体来创建新会话");
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
    .filter((agent): agent is NonNullable<typeof agent> => !!agent);
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

// 合并所有筛选和排序（本地过滤）
const filteredSessions = computed(() => {
  let sessions = props.sessions;

  // 1. 本地搜索过滤（始终生效，作为后端搜索的补充或过渡）
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

// 搜索模式下的会话列表（基于后端搜索结果）
const searchResultSessions = computed(() => {
  if (!isInSearchMode.value) return [];

  // 根据后端返回的搜索结果顺序获取 session 对象
  const sessions: ChatSession[] = [];
  const sessionMap = new Map(props.sessions.map((s) => [s.id, s]));

  for (const result of sessionResults.value) {
    const session = sessionMap.get(result.id);
    if (session) {
      // 如果有智能体筛选，也需要应用
      if (filterAgent.value === "all" || session.displayAgentId === filterAgent.value) {
        sessions.push(session);
      }
    }
  }
  return sessions;
});

// 最终显示的会话列表
const displaySessions = computed(() => {
  // 如果处于搜索模式
  if (isInSearchMode.value) {
    // 1. 如果有后端搜索结果，优先显示
    if (searchResultSessions.value.length > 0) {
      return searchResultSessions.value;
    }
    // 2. 如果正在搜索中（后端结果尚未返回），显示前端过滤结果作为过渡
    if (isSearching.value) {
      return filteredSessions.value;
    }
    // 3. 搜索完成且无结果，返回空数组
    return [];
  }

  // 非搜索模式，显示常规过滤列表
  return filteredSessions.value;
});

// 获取 session 的匹配详情
const getSessionMatches = (sessionId: string): MatchDetail[] | undefined => {
  if (!isInSearchMode.value) return undefined;
  const matches = searchMatchesMap.value.get(sessionId);
  if (!matches) return undefined;
  // 过滤掉名称匹配，因为名称已经显示在标题中了
  return matches.filter((m) => m.field !== "name");
};

// 虚拟滚动列表
const parentRef = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer({
  get count() {
    return displaySessions.value.length;
  },
  getScrollElement: () => parentRef.value,
  estimateSize: () => 71, // 67px item height + 4px margin
  overscan: 10,
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

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

// 获取消息数量（排除系统根节点）
const getMessageCount = (session: any) => {
  // 优先使用预计算的字段，避免访问可能不存在的 nodes 属性
  if (typeof session.messageCount === "number") {
    return session.messageCount;
  }
  return session.nodes ? Object.keys(session.nodes).length - 1 : 0;
};

// 获取会话当前显示的智能体信息
const getSessionDisplayAgent = (session: ChatSession) => {
  if (!session.displayAgentId) return null;
  return agentStore.getAgentById(session.displayAgentId);
};

// 确认删除
const confirmDelete = (session: ChatSession) => {
  ElMessageBox.confirm(`确定要删除对话"${session.name}"吗？`, "删除会话", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("delete", session.id);
    })
    .catch(() => {
      // 用户取消删除
    });
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
    customMessage.warning("会话名称不能为空");
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

// 打开会话目录并选中文件
const handleOpenDirectory = async (session: ChatSession) => {
  try {
    const { getSessionPath } = useChatStorageSeparated();
    const sessionPath = await getSessionPath(session.id);
    await invoke("open_file_directory", { filePath: sessionPath });
  } catch (error) {
    customMessage.error("打开目录失败");
  }
};

// 处理菜单命令
const handleMenuCommand = (
  command: "delete" | "rename" | "generate-name" | "export" | "open-directory",
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
  } else if (command === "open-directory") {
    handleOpenDirectory(session);
  }
};

// 定位到当前激活的会话
const scrollToCurrentSession = () => {
  if (!props.currentSessionId) return;

  const index = displaySessions.value.findIndex((s) => s.id === props.currentSessionId);
  if (index !== -1) {
    virtualizer.value.scrollToIndex(index, { align: "center" });
  } else {
    customMessage.info("当前会话在当前筛选条件下不可见");
  }
};

// 处理会话点击
const handleSessionClick = (session: ChatSession) => {
  // 如果开启了自动切换智能体，且会话有绑定的智能体
  if (settings.value.uiPreferences.autoSwitchAgentOnSessionChange && session.displayAgentId) {
    // 检查智能体是否存在
    const agent = agentStore.getAgentById(session.displayAgentId);
    if (agent) {
      agentStore.selectAgent(session.displayAgentId);
    }
  }

  emit("switch", session.id);
};
</script>

<template>
  <div class="sessions-sidebar">
    <div class="sessions-sidebar-header">
      <div class="header-top">
        <el-input
          v-model="searchQuery"
          placeholder="搜索会话..."
          :prefix-icon="Search"
          :suffix-icon="showLoadingIndicator ? Loading : ''"
          clearable
          size="default"
          class="search-input"
        >
          <template #suffix v-if="showLoadingIndicator">
            <el-icon class="is-loading"><Loading /></el-icon>
          </template>
        </el-input>

        <el-tooltip content="新建对话" placement="bottom" :show-after="500">
          <el-button type="primary" :icon="Plus" @click="handleQuickNewSession" circle />
        </el-tooltip>
      </div>

      <div class="header-actions">
        <div class="action-left">
          <el-popover trigger="click" width="320" popper-class="filter-popover">
            <template #reference>
              <div>
                <el-tooltip content="排序与筛选" placement="bottom" :show-after="500">
                  <el-button
                    :icon="Operation"
                    circle
                    size="small"
                    :type="hasActiveFilters ? 'primary' : undefined"
                  />
                </el-tooltip>
              </div>
            </template>

            <div class="filter-panel">
              <div class="filter-section">
                <div class="section-header">
                  <span class="section-title">排序方式</span>
                </div>
                <el-radio-group v-model="sortBy" size="small">
                  <el-radio-button value="updatedAt">最近更新</el-radio-button>
                  <el-radio-button value="createdAt">创建时间</el-radio-button>
                  <el-radio-button value="messageCount">消息数</el-radio-button>
                  <el-radio-button value="name">名称</el-radio-button>
                </el-radio-group>
              </div>

              <div class="filter-section">
                <div class="section-header">
                  <span class="section-title">时间范围</span>
                </div>
                <el-radio-group v-model="filterTime" size="small">
                  <el-radio-button value="all">全部</el-radio-button>
                  <el-radio-button value="today">今天</el-radio-button>
                  <el-radio-button value="week">本周</el-radio-button>
                  <el-radio-button value="month">本月</el-radio-button>
                  <el-radio-button value="older">更早</el-radio-button>
                </el-radio-group>
              </div>

              <div class="filter-section" v-if="availableAgents.length > 0">
                <div class="section-header">
                  <span class="section-title">智能体</span>
                </div>
                <div class="agent-list-scroll">
                  <div
                    class="agent-filter-item"
                    :class="{ active: filterAgent === 'all' }"
                    @click="filterAgent = 'all'"
                  >
                    <span class="agent-name">全部智能体</span>
                  </div>
                  <div
                    v-for="agent in availableAgents"
                    :key="agent?.id"
                    class="agent-filter-item"
                    :class="{ active: filterAgent === agent?.id }"
                    @click="agent && (filterAgent = agent.id)"
                  >
                    <Avatar
                      :src="resolveAvatarPath(agent, 'agent') || ''"
                      :alt="agent.displayName || agent.name"
                      :size="16"
                      shape="square"
                      :radius="3"
                    />
                    <span class="agent-name">{{ agent.displayName || agent.name }}</span>
                  </div>
                </div>
              </div>

              <div class="filter-footer" v-if="hasActiveFilters">
                <el-button size="small" link type="primary" @click="resetFilters"
                  >重置所有筛选</el-button
                >
              </div>
            </div>
          </el-popover>

          <el-tooltip content="定位当前会话" placement="bottom" :show-after="500">
            <el-button
              :icon="Position"
              @click="scrollToCurrentSession"
              circle
              size="small"
              :disabled="!currentSessionId"
            />
          </el-tooltip>
        </div>

        <div class="session-count">{{ displaySessions.length }} / {{ sessions.length }}</div>
      </div>
    </div>
    <div class="sessions-list" ref="parentRef">
      <div v-if="sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
        <p class="hint">点击下方按钮创建新会话</p>
      </div>

      <div v-else-if="displaySessions.length === 0" class="empty-state">
        <p>未找到匹配的会话</p>
        <p class="hint" v-if="isInSearchMode">尝试其他搜索关键词</p>
      </div>

      <div
        v-else
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="displaySessions[virtualItem.index].id"
          :data-index="virtualItem.index"
          :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }"
        >
          <div
            :class="[
              'session-item',
              { active: displaySessions[virtualItem.index].id === currentSessionId },
            ]"
            @click="handleSessionClick(displaySessions[virtualItem.index])"
          >
            <div class="session-content">
              <div class="session-title">
                <template v-if="getSessionDisplayAgent(displaySessions[virtualItem.index])">
                  <el-tooltip
                    :content="`当前使用: ${
                      getSessionDisplayAgent(displaySessions[virtualItem.index])?.displayName ||
                      getSessionDisplayAgent(displaySessions[virtualItem.index])?.name ||
                      ''
                    }`"
                    placement="top"
                    :show-after="50"
                  >
                    <Avatar
                      :src="
                        resolveAvatarPath(
                          getSessionDisplayAgent(displaySessions[virtualItem.index]),
                          'agent'
                        ) || ''
                      "
                      :alt="
                        getSessionDisplayAgent(displaySessions[virtualItem.index])?.displayName ||
                        getSessionDisplayAgent(displaySessions[virtualItem.index])?.name ||
                        ''
                      "
                      :size="20"
                      shape="square"
                      :radius="4"
                    />
                  </el-tooltip>
                </template>
                <span
                  :class="[
                    'title-text',
                    { generating: isGenerating(displaySessions[virtualItem.index].id) },
                  ]"
                >
                  {{ displaySessions[virtualItem.index].name }}
                </span>
              </div>

              <!-- 搜索匹配详情 -->
              <div
                v-if="getSessionMatches(displaySessions[virtualItem.index].id)"
                class="match-details"
              >
                <div
                  v-for="(match, index) in getSessionMatches(
                    displaySessions[virtualItem.index].id
                  )!.slice(0, 3)"
                  :key="index"
                  class="match-item"
                >
                  <span class="match-field"
                    >{{ getFieldLabel(match.field)
                    }}{{ match.role ? `(${getRoleLabel(match.role)})` : "" }}:</span
                  >
                  <span class="match-context" :title="match.context">{{ match.context }}</span>
                </div>
                <div
                  v-if="getSessionMatches(displaySessions[virtualItem.index].id)!.length > 3"
                  class="match-more"
                >
                  +{{ getSessionMatches(displaySessions[virtualItem.index].id)!.length - 3 }} 处匹配
                </div>
              </div>

              <div class="session-info">
                <span class="message-count"
                  >{{ getMessageCount(displaySessions[virtualItem.index]) }} 条</span
                >
                <span class="session-time">{{
                  formatRelativeTime(displaySessions[virtualItem.index].updatedAt)
                }}</span>
                <el-dropdown
                  @command="handleMenuCommand($event, displaySessions[virtualItem.index])"
                  trigger="click"
                  class="menu-dropdown"
                >
                  <div @click.stop>
                    <el-tooltip content="更多操作" placement="top" :show-after="500">
                      <el-button :icon="MoreFilled" size="small" text class="btn-menu" />
                    </el-tooltip>
                  </div>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        command="generate-name"
                        :icon="MagicStick"
                        :disabled="isGenerating(displaySessions[virtualItem.index].id)"
                      >
                        {{
                          isGenerating(displaySessions[virtualItem.index].id)
                            ? "生成中..."
                            : "生成标题"
                        }}
                      </el-dropdown-item>
                      <el-dropdown-item command="rename" :icon="Edit"> 重命名 </el-dropdown-item>
                      <el-dropdown-item command="export" :icon="Operation">
                        导出会话
                      </el-dropdown-item>
                      <el-dropdown-item command="open-directory" :icon="FolderOpened">
                        打开目录
                      </el-dropdown-item>
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
    <ExportSessionDialog v-model:visible="exportSessionDialogVisible" :session="sessionToExport" />
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
  flex-direction: column;
  gap: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.header-top {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.action-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.session-count {
  font-size: 11px;
  color: var(--text-color-light);
  opacity: 0.8;
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

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 4px;
  min-height: 67px; /* 最小高度，允许搜索结果撑开 */
  box-sizing: border-box;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  backdrop-filter: blur(var(--ui-blur));
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

.match-details {
  margin: 2px 0 4px 0;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.match-item {
  display: flex;
  gap: 4px;
  align-items: baseline;
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
}

.match-more {
  font-size: 10px;
  color: var(--primary-color);
  margin-top: 2px;
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

/* Popover 内部样式 */
.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
}

.agent-list-scroll {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
}

.agent-list-scroll::-webkit-scrollbar {
  width: 4px;
}

.agent-list-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 2px;
}

.agent-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: all 0.2s;
}

.agent-filter-item:hover {
  background-color: var(--hover-bg);
}

.agent-filter-item.active {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.agent-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.el-radio-group {
  backdrop-filter: none;
}
</style>
