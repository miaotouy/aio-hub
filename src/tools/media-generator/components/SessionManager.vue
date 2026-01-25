<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  History,
  ArrowUpDown,
  Wand2,
} from "lucide-vue-next";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";

const store = useMediaGenStore();

// 搜索与筛选
const searchQuery = ref("");
const sortBy = ref<"updatedAt" | "name" | "taskCount">("updatedAt");
const sortOrder = ref<"asc" | "desc">("desc");

// 重命名相关
const renameDialogVisible = ref(false);
const renamingId = ref<string | null>(null);
const newName = ref("");

// AI 命名状态
const namingSessionId = ref<string | null>(null);

/**
 * 获取会话中的任务数（基于节点统计）
 */
const getSessionTaskCount = (session: any) => {
  if (!session.nodes) return 0;
  return Object.values(session.nodes).filter((n: any) => n.metadata?.isMediaTask).length;
};

const filteredSessions = computed(() => {
  let result = [...store.sessions];

  // 1. 搜索
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter((s) => s.name.toLowerCase().includes(query));
  }

  // 2. 排序
  result.sort((a, b) => {
    let cmp = 0;
    if (sortBy.value === "updatedAt") {
      cmp = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    } else if (sortBy.value === "name") {
      cmp = a.name.localeCompare(b.name, "zh-CN");
    } else if (sortBy.value === "taskCount") {
      cmp = getSessionTaskCount(b) - getSessionTaskCount(a);
    }
    return sortOrder.value === "desc" ? cmp : -cmp;
  });

  return result;
});

const openRenameDialog = (sessionId: string, currentName: string) => {
  renamingId.value = sessionId;
  newName.value = currentName;
  renameDialogVisible.value = true;
};

const handleRename = async () => {
  if (!renamingId.value || !newName.value.trim()) return;
  await store.updateSessionName(renamingId.value, newName.value.trim());
  renameDialogVisible.value = false;
  renamingId.value = null;
  newName.value = "";
  customMessage.success("重命名成功");
};

const handleDelete = (sessionId: string, name: string) => {
  ElMessageBox.confirm(`确定删除会话 "${name}" 吗？`, "删除确认", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  }).then(() => {
    store.deleteSession(sessionId);
    customMessage.success("会话已删除");
  });
};

const handleSwitch = (sessionId: string) => {
  if (store.currentSessionId === sessionId) return;
  store.switchSession(sessionId);
};

const handleNewSession = () => {
  store.createNewSession();
};

const handleAiNaming = async (sessionId: string) => {
  if (namingSessionId.value || store.isNaming) return;

  try {
    namingSessionId.value = sessionId;
    await store.generateSessionName(sessionId);
    customMessage.success("AI 命名完成");
  } catch (error: any) {
    // 错误处理已在 store 中记录，这里只需提示用户
    customMessage.error(error.message || "AI 命名失败");
  } finally {
    namingSessionId.value = null;
  }
};

const formatTime = (timeStr: string) => {
  try {
    return formatDistanceToNow(new Date(timeStr), { addSuffix: true, locale: zhCN });
  } catch (e) {
    return timeStr;
  }
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};
</script>

<template>
  <div class="session-manager">
    <div class="session-header">
      <div class="header-main">
        <span class="title">历史会话</span>
        <el-button type="primary" size="small" @click="handleNewSession">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div class="header-tools">
        <el-input
          v-model="searchQuery"
          placeholder="搜索会话..."
          size="small"
          clearable
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-dropdown trigger="click" size="small" @command="(c: any) => (sortBy = c)">
          <el-button size="small" class="tool-btn">
            <el-icon><ArrowUpDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="updatedAt" :disabled="sortBy === 'updatedAt'">
                按更新时间
              </el-dropdown-item>
              <el-dropdown-item command="name" :disabled="sortBy === 'name'">
                按名称
              </el-dropdown-item>
              <el-dropdown-item command="taskCount" :disabled="sortBy === 'taskCount'">
                按任务数
              </el-dropdown-item>
              <el-dropdown-item divided @click="toggleSortOrder">
                {{ sortOrder === "asc" ? "升序" : "降序" }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-scrollbar class="session-scroll-area">
      <div v-if="filteredSessions.length === 0" class="empty-state">
        <el-empty :image-size="60" :description="searchQuery ? '未找到匹配会话' : '暂无历史会话'" />
      </div>

      <div v-else class="session-list">
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="session-item"
          :class="{ active: store.currentSessionId === session.id }"
          @click="handleSwitch(session.id)"
        >
          <div class="session-icon">
            <el-icon><History /></el-icon>
          </div>

          <div class="session-info">
            <div class="session-name-row">
              <span class="name" :title="session.name">{{ session.name }}</span>
            </div>
            <div class="session-meta">
              <span class="task-count">{{ getSessionTaskCount(session) }} 任务</span>
              <span class="dot">·</span>
              <span class="time">{{ formatTime(session.updatedAt) }}</span>
            </div>
          </div>

          <div class="session-actions" @click.stop>
            <el-dropdown
              trigger="click"
              @command="
                (cmd: any) => {
                  if (cmd === 'rename') openRenameDialog(session.id, session.name);
                  if (cmd === 'ai-rename') handleAiNaming(session.id);
                  if (cmd === 'delete') handleDelete(session.id, session.name);
                }
              "
            >
              <el-button
                link
                size="small"
                class="more-btn"
                :loading="namingSessionId === session.id"
              >
                <el-icon v-if="namingSessionId !== session.id"><MoreVertical /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    command="ai-rename"
                    :icon="Wand2"
                    :disabled="
                      getSessionTaskCount(session) === 0 || !!namingSessionId || store.isNaming
                    "
                  >
                    AI 自动命名
                  </el-dropdown-item>
                  <el-dropdown-item command="rename" :icon="Edit2">重命名</el-dropdown-item>
                  <el-dropdown-item command="delete" :icon="Trash2" class="delete-item">
                    删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <!-- 重命名对话框 -->
    <el-dialog
      v-model="renameDialogVisible"
      title="重命名会话"
      width="340px"
      append-to-body
      destroy-on-close
    >
      <el-input
        v-model="newName"
        placeholder="请输入新名称"
        @keyup.enter="handleRename"
        autofocus
      />
      <template #footer>
        <div class="dialog-footer">
          <el-button size="small" @click="renameDialogVisible = false">取消</el-button>
          <el-button size="small" type="primary" @click="handleRename">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.session-manager {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.session-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-main .title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.header-tools {
  display: flex;
  gap: 6px;
  align-items: center;
}

.search-input {
  flex: 1;
}

.tool-btn {
  padding: 0 8px;
}

.session-scroll-area {
  flex: 1;
}

.session-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  background-color: transparent;
}

.session-item:hover {
  background-color: var(--el-fill-color-light);
}

.session-item.active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 92%);
  border-color: color-mix(in srgb, var(--el-color-primary), transparent 60%);
}

.session-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  transition: all 0.2s;
}

.active .session-icon {
  background-color: var(--el-color-primary);
  color: white;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.session-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  opacity: 0.5;
}

.session-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.more-btn {
  padding: 4px;
  height: auto;
}

.delete-item {
  color: var(--el-color-danger) !important;
}

.empty-state {
  padding-top: 40px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:deep(.el-input__wrapper) {
  background-color: var(--input-bg);
}
</style>
