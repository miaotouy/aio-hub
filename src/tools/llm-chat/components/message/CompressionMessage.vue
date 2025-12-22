<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ChatMessageNode, MessageRole } from "../../types";
import {
  Database,
  Edit2,
  Check,
  X,
  User,
  Bot,
  Settings,
  Trash2,
} from "lucide-vue-next";

interface Props {
  message: ChatMessageNode;
}

interface Emits {
  (e: "toggle-enabled"): void;
  (e: "delete"): void;
  (e: "update-content", content: string): void;
  (e: "update-role", role: MessageRole): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 编辑状态
const isEditing = ref(false);
const editedContent = ref(props.message.content);

// 角色列表
const roles: { label: string; value: MessageRole; icon: any }[] = [
  { label: "系统", value: "system", icon: Settings },
  { label: "用户", value: "user", icon: User },
  { label: "助手", value: "assistant", icon: Bot },
];

// 压缩节点是否启用（影响上下文构建）
const isEnabled = computed(() => props.message.isEnabled !== false);

// 统计信息
const stats = computed(() => {
  const meta = props.message.metadata || {};
  return {
    msgCount: meta.originalMessageCount || 0,
  };
});

// 格式化时间
const formattedTime = computed(() => {
  if (!props.message.timestamp) return "";
  return new Date(props.message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
});

const startEdit = () => {
  editedContent.value = props.message.content;
  isEditing.value = true;
};

const cancelEdit = () => {
  isEditing.value = false;
};

const saveEdit = () => {
  if (editedContent.value !== props.message.content) {
    emit("update-content", editedContent.value);
  }
  isEditing.value = false;
};

const handleRoleChange = (role: MessageRole) => {
  if (role !== props.message.role) {
    emit("update-role", role);
  }
};

watch(
  () => props.message.content,
  (newVal) => {
    if (!isEditing.value) {
      editedContent.value = newVal;
    }
  }
);
</script>

<template>
  <div
    class="compression-message"
    :class="{ 'is-disabled': !isEnabled, 'is-editing': isEditing }"
  >
    <!-- 装饰性侧边栏 -->
    <div
      class="compression-bar"
      :title="isEnabled ? '禁用压缩 (恢复上下文)' : '启用压缩'"
      @click="emit('toggle-enabled')"
    >
      <div class="bar-line"></div>
      <div class="bar-icon">
        <Database :size="14" :class="{ 'text-primary': isEnabled }" />
      </div>
      <div class="bar-line"></div>
    </div>

    <div class="compression-content-wrapper">
      <!-- 头部信息 -->
      <div class="compression-header">
        <div class="header-left">
          <el-dropdown trigger="click" @command="handleRoleChange">
            <span class="role-badge" :class="message.role">
              <component :is="roles.find((r) => r.value === message.role)?.icon" :size="12" />
              {{ roles.find((r) => r.value === message.role)?.label }}
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="role in roles"
                  :key="role.value"
                  :command="role.value"
                  :disabled="message.role === role.value"
                >
                  <component :is="role.icon" :size="14" style="margin-right: 8px" />
                  {{ role.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <span class="badge">上下文压缩</span>
          <span class="time">{{ formattedTime }}</span>
        </div>
        <div class="header-right">
          <!-- 编辑模式按钮 -->
          <template v-if="isEditing">
            <button class="action-btn success" title="保存修改" @click="saveEdit">
              <Check :size="14" />
            </button>
            <button class="action-btn danger" title="取消编辑" @click="cancelEdit">
              <X :size="14" />
            </button>
          </template>

          <!-- 常规模式按钮 -->
          <template v-else>
            <button class="action-btn" title="编辑摘要" @click="startEdit">
              <Edit2 :size="14" />
            </button>

            <button
              class="action-btn"
              :title="isEnabled ? '禁用压缩 (恢复原始消息)' : '启用压缩 (隐藏原始消息)'"
              @click="emit('toggle-enabled')"
            >
              <Database :size="14" :class="{ 'text-primary': isEnabled }" />
            </button>

            <el-popconfirm title="确定删除此压缩节点吗？" @confirm="emit('delete')">
              <template #reference>
                <button class="action-btn danger-hover" title="删除">
                  <Trash2 :size="14" />
                </button>
              </template>
            </el-popconfirm>
          </template>
        </div>
      </div>

      <!-- 摘要内容 -->
      <div class="compression-summary">
        <el-input
          v-if="isEditing"
          v-model="editedContent"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 10 }"
          placeholder="请输入压缩摘要..."
          class="edit-input"
        />
        <template v-else>
          {{ message.content }}
        </template>
      </div>

      <!-- 底部统计 -->
      <div class="compression-footer">
        <span class="stat-item" title="原始消息数量"> 包含 {{ stats.msgCount }} 条消息 </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compression-message {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  margin: 8px 0;
  background-color: var(--card-bg);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.compression-message:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-color-soft);
}

.compression-message.is-disabled {
  opacity: 0.7;
  border-style: dotted;
  background-color: transparent;
}

.compression-message.is-editing {
  border-color: var(--primary-color);
  background-color: var(--bg-color-soft);
}

/* 左侧装饰条 */
.compression-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  cursor: pointer;
  color: var(--text-color-light);
}

.compression-bar:hover {
  color: var(--primary-color);
}

.bar-line {
  flex: 1;
  width: 2px;
  background-color: currentColor;
  opacity: 0.2;
  border-radius: 1px;
}

.bar-icon {
  padding: 4px 0;
}

/* 内容区域 */
.compression-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0; /* 防止文本溢出 */
}

.compression-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--bg-color-mute);
  color: var(--text-color-secondary);
}

.role-badge:hover {
  background-color: var(--hover-bg);
  color: var(--text-color-primary);
}

.role-badge.system {
  background-color: var(--warning-color-light-opacity);
  color: var(--warning-color);
}

.role-badge.user {
  background-color: var(--primary-color-light-opacity);
  color: var(--primary-color);
}

.role-badge.assistant {
  background-color: var(--success-color-light-opacity);
  color: var(--success-color);
}

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--primary-color-light-opacity);
  color: var(--primary-color);
}

.time {
  font-size: 11px;
  color: var(--text-color-light);
}

.header-right {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: var(--hover-bg);
  color: var(--text-color-primary);
}

.action-btn.success {
  color: var(--success-color);
}

.action-btn.success:hover {
  background-color: var(--success-color-light-opacity);
}

.action-btn.danger {
  color: var(--danger-color);
}

.action-btn.danger:hover {
  background-color: var(--danger-color-light-opacity);
}

.action-btn.danger-hover:hover {
  background-color: var(--danger-color-light-opacity);
  color: var(--danger-color);
}

.text-primary {
  color: var(--primary-color);
}

.compression-summary {
  font-family: var(--font-family-mono);
  line-height: 1.5;
  color: var(--text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.edit-input :deep(.el-textarea__inner) {
  background-color: var(--input-bg);
  border-color: var(--border-color);
  color: var(--text-color-primary);
  font-family: var(--font-family-mono);
  font-size: 13px;
  padding: 4px 8px;
}

.edit-input :deep(.el-textarea__inner:focus) {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color-light-opacity);
}

.compression-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-light);
}
</style>
