import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Notification, NotificationType } from "@/types/notification";

const STORAGE_KEY = "app-notifications";
const STORAGE_KEY_INIT = "app-notifications-initialized";

export const useNotificationStore = defineStore("notification", () => {
  const notifications = ref<Notification[]>([]);
  const centerVisible = ref(false);

  // 初始化：从本地存储加载
  const loadNotifications = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        notifications.value = JSON.parse(saved);
      }

      // 检查是否需要发送欢迎消息
      const initialized = localStorage.getItem(STORAGE_KEY_INIT);
      if (!initialized && notifications.value.length === 0) {
        push({
          title: "欢迎使用 AIO Hub",
          content: "消息通知系统已就绪！你可以在这里查看系统通知和工具消息。",
          type: "system",
          source: "system",
        });
        localStorage.setItem(STORAGE_KEY_INIT, "true");
      }
    } catch (error) {
      console.error("Failed to load notifications from localStorage", error);
    }
  };

  // 跨窗口同步
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        notifications.value = JSON.parse(event.newValue);
      } catch (error) {
        console.error("Failed to sync notifications from storage event", error);
      }
    }
  });

  // 持久化：监听变化并保存
  watch(
    notifications,
    (newVal) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal));
      } catch (error) {
        console.error("Failed to save notifications to localStorage", error);
      }
    },
    { deep: true }
  );

  // Getters
  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length);

  const sortedNotifications = computed(() =>
    [...notifications.value].sort((a, b) => b.timestamp - a.timestamp)
  );

  // Actions
  const push = (payload: {
    title: string;
    content: string;
    type?: NotificationType;
    source?: string;
    metadata?: Notification["metadata"];
  }) => {
    const newNotification: Notification = {
      id: crypto.randomUUID(),
      title: payload.title,
      content: payload.content,
      type: payload.type || "info",
      timestamp: Date.now(),
      read: false,
      source: payload.source,
      metadata: payload.metadata,
    };
    notifications.value.push(newNotification);
  };

  const markRead = (id: string) => {
    const notification = notifications.value.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
    }
  };

  const markAllRead = () => {
    notifications.value.forEach((n) => (n.read = true));
  };

  const remove = (id: string) => {
    const index = notifications.value.findIndex((n) => n.id === id);
    if (index !== -1) {
      notifications.value.splice(index, 1);
    }
  };

  const clearAll = () => {
    notifications.value = [];
  };

  const toggleCenter = (visible?: boolean) => {
    centerVisible.value = visible !== undefined ? visible : !centerVisible.value;
  };

  // 执行加载
  loadNotifications();

  return {
    notifications,
    centerVisible,
    unreadCount,
    sortedNotifications,
    push,
    markRead,
    markAllRead,
    remove,
    clearAll,
    toggleCenter,
  };
});