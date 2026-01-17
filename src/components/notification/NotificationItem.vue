<script setup lang="ts">
import { computed } from "vue";
import {
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings,
  X,
  Clock,
  Tag,
  Maximize2,
} from "lucide-vue-next";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Notification } from "@/types/notification";

const props = defineProps<{
  notification: Notification;
}>();

const emit = defineEmits<{
  (e: "click", id: string): void;
  (e: "delete", id: string): void;
  (e: "view-detail", notification: Notification): void;
}>();

// 根据类型获取图标
const typeIcon = computed(() => {
  switch (props.notification.type) {
    case "success":
      return CheckCircle;
    case "warning":
      return AlertTriangle;
    case "error":
      return XCircle;
    case "system":
      return Settings;
    default:
      return Info;
  }
});

// 根据类型获取颜色类
const typeClass = computed(() => `type-${props.notification.type}`);

// 格式化时间
const relativeTime = computed(() => {
  return formatDistanceToNow(props.notification.timestamp, {
    addSuffix: true,
    locale: zhCN,
  });
});

const handleClick = () => {
  emit("click", props.notification.id);
};

const handleDelete = (e: Event) => {
  e.stopPropagation();
  emit("delete", props.notification.id);
};

const handleViewDetail = (e: Event) => {
  e.stopPropagation();
  emit("view-detail", props.notification);
};
</script>

<template>
  <div
    class="notification-item"
    :class="[{ unread: !notification.read }, typeClass]"
    @click="handleClick"
  >
    <div class="item-header">
      <div class="type-icon">
        <component :is="typeIcon" :size="16" />
      </div>
      <div class="title">{{ notification.title }}</div>
      <button class="delete-btn" @click="handleDelete" title="删除">
        <X :size="14" />
      </button>
    </div>

    <div class="item-content">
      {{ notification.content }}
    </div>

    <div class="item-footer">
      <div class="footer-left">
        <div class="time">
          <Clock :size="12" />
          <span>{{ relativeTime }}</span>
        </div>
        <div v-if="notification.source" class="source">
          <Tag :size="12" />
          <span>{{ notification.source }}</span>
        </div>
      </div>
      <button class="detail-btn" @click="handleViewDetail" title="查看详情">
        <Maximize2 :size="12" />
        <span>详情</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.notification-item {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.notification-item:hover {
  background-color: var(--input-bg);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-1px);
  box-shadow: var(--el-box-shadow-lighter);
}

/* 类型边框与背景 */
.notification-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: transparent;
  transition: background-color 0.2s;
}

.type-info::before {
  background-color: var(--el-color-info);
}
.type-success::before {
  background-color: var(--el-color-success);
}
.type-warning::before {
  background-color: var(--el-color-warning);
}
.type-error::before {
  background-color: var(--el-color-danger);
}
.type-system::before {
  background-color: var(--el-color-primary);
}

/* 类型背景微调 (极淡色) */
.type-info {
  background-color: rgba(var(--el-color-info-rgb, 144, 147, 153), 0.02);
}
.type-success {
  background-color: rgba(var(--el-color-success-rgb, 103, 194, 58), 0.02);
}
.type-warning {
  background-color: rgba(var(--el-color-warning-rgb, 230, 162, 60), 0.02);
}
.type-error {
  background-color: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.02);
}
.type-system {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.02);
}

/* 未读状态指示 */
.notification-item.unread {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.08);
}

.notification-item.unread::after {
  content: "";
  position: absolute;
  top: 12px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  box-shadow: 0 0 8px var(--el-color-primary);
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 类型颜色定义 */
.type-info .type-icon {
  color: var(--el-color-info);
}
.type-success .type-icon {
  color: var(--el-color-success);
}
.type-warning .type-icon {
  color: var(--el-color-warning);
}
.type-error .type-icon {
  color: var(--el-color-danger);
}
.type-system .type-icon {
  color: var(--el-color-primary);
}

.title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  background: transparent;
  border: none;
  color: var(--text-color-placeholder);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
}

.notification-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.item-content {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-color-placeholder);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time,
.source {
  display: flex;
  align-items: center;
  gap: 4px;
}

.detail-btn {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  font-size: 11px;
}

.detail-btn:hover {
  background-color: var(--card-bg);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}

/* 暗色模式微调 */
:root.dark .notification-item.unread {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.12);
}

:root.dark .type-info {
  background-color: rgba(var(--el-color-info-rgb, 144, 147, 153), 0.05);
}
:root.dark .type-success {
  background-color: rgba(var(--el-color-success-rgb, 103, 194, 58), 0.05);
}
:root.dark .type-warning {
  background-color: rgba(var(--el-color-warning-rgb, 230, 162, 60), 0.05);
}
:root.dark .type-error {
  background-color: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.05);
}
:root.dark .type-system {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.05);
}
</style>
