<script setup lang="ts">
import { ref } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { Plus, MessageSquare, Edit2, Trash2, Check, X } from "lucide-vue-next";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const store = useMediaGenStore();
const editingId = ref<string | null>(null);
const editName = ref("");

const startEdit = (sessionId: string, name: string) => {
  editingId.value = sessionId;
  editName.value = name;
};

const cancelEdit = () => {
  editingId.value = null;
  editName.value = "";
};

const handleRename = async (sessionId: string) => {
  if (!editName.value.trim()) return;
  await store.updateSessionName(sessionId, editName.value.trim());
  cancelEdit();
};

const handleDelete = (sessionId: string) => {
  store.deleteSession(sessionId);
};

const handleSwitch = (sessionId: string) => {
  store.switchSession(sessionId);
};

const handleNewSession = () => {
  store.createNewSession();
};

const formatTime = (timeStr: string) => {
  try {
    return formatDistanceToNow(new Date(timeStr), { addSuffix: true, locale: zhCN });
  } catch (e) {
    return timeStr;
  }
};
</script>

<template>
  <div class="session-manager">
    <div class="session-header">
      <span class="title">历史会话</span>
      <el-button type="primary" size="small" @click="handleNewSession">
        <el-icon><Plus /></el-icon>
        新建
      </el-button>
    </div>

    <el-scrollbar max-height="400px">
      <div class="session-list">
        <div
          v-for="session in store.sessions"
          :key="session.id"
          class="session-item"
          :class="{ active: store.currentSessionId === session.id }"
          @click="handleSwitch(session.id)"
        >
          <div class="session-icon">
            <el-icon><MessageSquare /></el-icon>
          </div>

          <div class="session-info">
            <template v-if="editingId === session.id">
              <div class="edit-input-wrapper" @click.stop>
                <el-input
                  v-model="editName"
                  size="small"
                  @keyup.enter="handleRename(session.id)"
                  @keyup.esc="cancelEdit"
                />
                <div class="edit-actions">
                  <el-button link size="small" @click="handleRename(session.id)">
                    <el-icon><Check /></el-icon>
                  </el-button>
                  <el-button link size="small" @click="cancelEdit">
                    <el-icon><X /></el-icon>
                  </el-button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="session-name-row">
                <span class="name">{{ session.name }}</span>
                <span class="task-count">{{ session.tasks?.length || 0 }} 任务</span>
              </div>
              <div class="session-meta">
                {{ formatTime(session.updatedAt) }}
              </div>
            </template>
          </div>

          <div class="session-actions" v-if="editingId !== session.id" @click.stop>
            <el-button link size="small" @click="startEdit(session.id, session.name)">
              <el-icon><Edit2 /></el-icon>
            </el-button>
            <el-popconfirm title="确定删除此会话吗？" @confirm="handleDelete(session.id)">
              <template #reference>
                <el-button link size="small" type="danger">
                  <el-icon><Trash2 /></el-icon>
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.session-manager {
  width: 280px;
  padding: 4px;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.session-header .title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.session-list {
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
  position: relative;
  border: 1px solid transparent;
}

.session-item:hover {
  background-color: var(--el-fill-color-light);
}

.session-item.active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
  border-color: color-mix(in srgb, var(--el-color-primary), transparent 50%);
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
}

.active .session-icon {
  background-color: var(--el-color-primary);
  color: white;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-count {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.session-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.session-actions {
  display: none;
  gap: 4px;
}

.session-item:hover .session-actions {
  display: flex;
}

.edit-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
