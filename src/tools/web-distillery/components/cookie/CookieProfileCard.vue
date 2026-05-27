<script setup lang="ts">
import { computed } from "vue";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  MoreHorizontal,
  Edit2,
  Trash2,
  FileJson,
  FileText,
} from "lucide-vue-next";
import type { CookieProfile } from "../../types";

interface Props {
  profile: CookieProfile;
  isActive: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "toggle-active": [id: string];
  edit: [id: string];
  delete: [id: string];
  "export-json": [id: string];
  "export-netscape": [id: string];
}>();

const hasExpiredCookies = computed(() => {
  const now = new Date();
  return props.profile.cookies.some(
    (c) => c.expires && new Date(c.expires) < now
  );
});

const lastUsedText = computed(() => {
  if (!props.profile.lastUsedAt) return "从未使用";
  try {
    return formatDistanceToNow(new Date(props.profile.lastUsedAt), {
      addSuffix: true,
      locale: zhCN,
    });
  } catch {
    return "未知";
  }
});

function handleCardClick() {
  emit("toggle-active", props.profile.id);
}

function handleEdit() {
  emit("edit", props.profile.id);
}

function handleDelete() {
  emit("delete", props.profile.id);
}

function handleExportJson() {
  emit("export-json", props.profile.id);
}

function handleExportNetscape() {
  emit("export-netscape", props.profile.id);
}
</script>

<template>
  <div
    class="profile-card"
    :class="{
      'is-active': isActive,
      'has-expired': hasExpiredCookies && !isActive,
    }"
    role="button"
    :aria-pressed="isActive"
    :aria-label="`${profile.name}，${isActive ? '已激活' : '未激活'}`"
    @click="handleCardClick"
  >
    <!-- 激活状态指示 + 过期警告 -->
    <div class="card-header-row">
      <span class="radio-indicator" :class="{ active: isActive }">
        {{ isActive ? "◉" : "○" }}
      </span>
      <span
        v-if="hasExpiredCookies"
        class="expired-badge"
        title="有 Cookie 已过期"
        >⚠️</span
      >
      <div class="card-actions" @click.stop>
        <el-dropdown trigger="click" placement="bottom-end">
          <div>
            <el-button text size="small" class="more-btn" aria-label="更多操作">
              <MoreHorizontal :size="14" />
            </el-button>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleEdit">
                <Edit2 :size="12" class="dropdown-icon" />
                编辑
              </el-dropdown-item>
              <el-dropdown-item @click="handleExportJson">
                <FileJson :size="12" class="dropdown-icon" />
                导出 JSON
              </el-dropdown-item>
              <el-dropdown-item @click="handleExportNetscape">
                <FileText :size="12" class="dropdown-icon" />
                导出 Netscape
              </el-dropdown-item>
              <el-dropdown-item
                divided
                class="danger-item"
                @click="handleDelete"
              >
                <Trash2 :size="12" class="dropdown-icon" />
                删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 主要信息 -->
    <div class="card-body">
      <div class="profile-name" :title="profile.name">{{ profile.name }}</div>
      <div class="profile-meta">
        <span class="cookie-count">{{ profile.cookies.length }} 条 cookie</span>
      </div>
      <div class="profile-time">{{ lastUsedText }}</div>
    </div>
  </div>
</template>

<style scoped>
.profile-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  min-width: 180px;
  user-select: none;
}

.profile-card:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.profile-card.is-active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.profile-card.has-expired {
  border-color: var(--el-color-warning);
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.radio-indicator {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
  line-height: 1;
  flex-shrink: 0;
}

.radio-indicator.active {
  color: var(--el-color-primary);
}

.expired-badge {
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}

.card-actions {
  margin-left: auto;
}

.more-btn {
  padding: 2px 4px !important;
  height: auto !important;
  opacity: 0;
  transition: opacity 0.15s;
}

.profile-card:hover .more-btn {
  opacity: 1;
}

.card-body {
  flex: 1;
}

.profile-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
}

.profile-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.cookie-count {
  font-variant-numeric: tabular-nums;
}

.profile-time {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  margin-top: 3px;
}

.dropdown-icon {
  margin-right: 6px;
  flex-shrink: 0;
}

:deep(.danger-item .el-dropdown-menu__item) {
  color: var(--el-color-danger) !important;
}

:deep(.danger-item) {
  color: var(--el-color-danger) !important;
}
</style>
