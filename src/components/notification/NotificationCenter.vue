<script setup lang="ts">
import { computed, ref } from "vue";
import { useNotificationStore } from "@/stores/notification";
import { useRouter } from "vue-router";
import {
  BellOff,
  CheckCheck,
  Trash2,
  X,
  Clock,
  Tag,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  Settings,
} from "lucide-vue-next";
import NotificationItem from "./NotificationItem.vue";
import { ElMessageBox } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import type { Notification } from "@/types/notification";
import { format } from "date-fns";

const store = useNotificationStore();
const router = useRouter();

const visible = computed({
  get: () => store.centerVisible,
  set: (val) => store.toggleCenter(val),
});

const notifications = computed(() => store.sortedNotifications);
const unreadCount = computed(() => store.unreadCount);

// 详情弹窗
const detailVisible = ref(false);
const currentNotification = ref<Notification | null>(null);

const handleViewDetail = (notification: Notification) => {
  currentNotification.value = notification;
  detailVisible.value = true;
  store.markRead(notification.id);
};

const handleItemClick = (id: string) => {
  const item = notifications.value.find((n) => n.id === id);
  if (item) {
    store.markRead(id);
    if (item.metadata?.path) {
      router.push(item.metadata.path);
      store.toggleCenter(false);
    }
  }
};

const handleMarkAllRead = () => {
  store.markAllRead();
};

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm("确定要清空所有消息通知吗？", "清空确认", {
      confirmButtonText: "清空",
      cancelButtonText: "取消",
      type: "warning",
    });
    store.clearAll();
  } catch {
    // 用户取消
  }
};

const handleClose = () => {
  store.toggleCenter(false);
};

// 根据类型获取图标
const getTypeIcon = (type: string) => {
  switch (type) {
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
};

// 获取类型文本
const getTypeText = (type: string) => {
  const map: Record<string, string> = {
    success: "成功",
    warning: "警告",
    error: "错误",
    system: "系统",
    info: "信息",
  };
  return map[type] || "通知";
};
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="360px"
    :with-header="false"
    class="notification-drawer"
    modal-class="notification-overlay"
  >
    <div class="center-container">
      <!-- 头部 -->
      <div class="center-header">
        <div class="header-title">
          <span>消息中心</span>
          <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="unread-badge" />
        </div>
        <div class="header-actions">
          <el-tooltip content="全部标记为已读" placement="bottom">
            <button class="action-btn" :disabled="unreadCount === 0" @click="handleMarkAllRead">
              <CheckCheck :size="18" />
            </button>
          </el-tooltip>
          <el-tooltip content="关闭" placement="bottom">
            <button class="action-btn close-btn" @click="handleClose">
              <X :size="18" />
            </button>
          </el-tooltip>
        </div>
      </div>

      <!-- 列表区域 -->
      <div class="center-content">
        <template v-if="notifications.length > 0">
          <div class="notification-list">
            <NotificationItem
              v-for="item in notifications"
              :key="item.id"
              :notification="item"
              @click="handleItemClick"
              @delete="store.remove"
              @view-detail="handleViewDetail"
            />
          </div>
        </template>
        <div v-else class="empty-state">
          <BellOff :size="48" class="empty-icon" />
          <p>暂无消息通知</p>
        </div>
      </div>

      <!-- 底部操作 -->
      <div v-if="notifications.length > 0" class="center-footer">
        <el-button type="danger" plain class="clear-btn" @click="handleClearAll">
          <template #icon>
            <Trash2 :size="16" />
          </template>
          清空所有消息
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- 详情对话框 -->
  <BaseDialog
    v-model="detailVisible"
    :title="currentNotification?.title || '消息详情'"
    width="540px"
    height="auto"
  >
    <div v-if="currentNotification" class="detail-container">
      <div class="detail-meta">
        <div class="meta-item type-tag" :class="`type-${currentNotification.type}`">
          <component :is="getTypeIcon(currentNotification.type)" :size="14" />
          <span>{{ getTypeText(currentNotification.type) }}</span>
        </div>
        <div class="meta-item">
          <Clock :size="14" />
          <span>{{ format(currentNotification.timestamp, "yyyy-MM-dd HH:mm:ss") }}</span>
        </div>
        <div v-if="currentNotification.source" class="meta-item">
          <Tag :size="14" />
          <span>{{ currentNotification.source }}</span>
        </div>
      </div>
      <div class="detail-content">
        <RichTextRenderer
          :content="currentNotification.content"
          :version="RendererVersion.V2_CUSTOM_PARSER"
          :enable-enter-animation="false"
        />
      </div>
      <div v-if="currentNotification.metadata?.path" class="detail-actions">
        <button class="primary-action-btn" @click="handleItemClick(currentNotification.id)">
          前往查看
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.center-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.center-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.unread-badge :deep(.el-badge__content) {
  background-color: var(--el-color-primary);
  border: none;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  background: transparent;
  border: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background-color: var(--input-bg);
  color: var(--el-color-primary);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.close-btn:hover {
  color: var(--el-color-danger) !important;
}

.center-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.notification-list {
  display: flex;
  flex-direction: column;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-placeholder);
  gap: 16px;
}

.empty-icon {
  opacity: 0.3;
}

.center-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
}

.clear-btn {
  width: 100%;
  border-radius: 8px;
}

/* 覆盖 el-drawer 默认样式 */
:global(.notification-drawer) {
  background-color: transparent !important;
  box-shadow: var(--el-box-shadow-light) !important;
}

:global(.notification-drawer .el-drawer__body) {
  padding: 0 !important;
  background-color: transparent !important;
}

:global(.notification-overlay) {
  background-color: rgba(0, 0, 0, 0.05) !important;
}

/* 适配暗色模式下的边框 */
:root.dark :global(.notification-drawer) {
  border-left: 1px solid var(--border-color);
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-meta {
  display: flex;
  gap: 16px;
  color: var(--text-color-placeholder);
  font-size: 13px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.type-tag.type-info {
  color: var(--el-color-info);
  background-color: rgba(var(--el-color-info-rgb, 144, 147, 153), 0.1);
}
.type-tag.type-success {
  color: var(--el-color-success);
  background-color: rgba(var(--el-color-success-rgb, 103, 194, 58), 0.1);
}
.type-tag.type-warning {
  color: var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb, 230, 162, 60), 0.1);
}
.type-tag.type-error {
  color: var(--el-color-danger);
  background-color: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.1);
}
.type-tag.type-system {
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.1);
}

.detail-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
  max-height: 400px;
  overflow-y: auto;
  padding: 16px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.detail-content :deep(.rich-text-renderer) {
  background-color: transparent;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.primary-action-btn {
  background-color: var(--el-color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-action-btn:hover {
  background-color: color-mix(in srgb, var(--el-color-primary) 80%, white);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
}

.primary-action-btn:active {
  transform: translateY(0);
}
</style>
