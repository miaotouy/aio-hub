import { computed } from "vue";
import { useNotificationStore } from "@/stores/notification";
import type { NotificationType, NotificationMetadata } from "@/types/notification";

export interface NotificationOptions {
  source?: string;
  metadata?: NotificationMetadata;
}

export function useNotification() {
  const store = useNotificationStore();

  const send = (
    title: string,
    content: string,
    type: NotificationType = "info",
    options: NotificationOptions = {}
  ) => {
    store.push({
      title,
      content,
      type,
      source: options.source,
      metadata: options.metadata,
    });
  };

  return {
    // 状态
    unreadCount: computed(() => store.unreadCount),
    centerVisible: computed(() => store.centerVisible),
    notifications: computed(() => store.sortedNotifications),

    // 便捷方法
    info: (title: string, content: string, options?: NotificationOptions) =>
      send(title, content, "info", options),
    success: (title: string, content: string, options?: NotificationOptions) =>
      send(title, content, "success", options),
    warning: (title: string, content: string, options?: NotificationOptions) =>
      send(title, content, "warning", options),
    error: (title: string, content: string, options?: NotificationOptions) =>
      send(title, content, "error", options),
    system: (title: string, content: string, options?: NotificationOptions) =>
      send(title, content, "system", options),

    // 操作
    markRead: store.markRead,
    markAllRead: store.markAllRead,
    remove: store.remove,
    clearAll: store.clearAll,
    toggleCenter: store.toggleCenter,
  };
}