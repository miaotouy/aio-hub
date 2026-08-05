// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Notification, NotificationType } from "@/types/notification";
import { createModuleLogger } from "@/utils/logger";

const STORAGE_KEY = "app-notifications";
const STORAGE_KEY_INIT = "app-notifications-initialized";
const logger = createModuleLogger("stores/notification");

interface NotificationPayload {
  title: string;
  content: string;
  type?: NotificationType;
  source?: string;
  metadata?: Notification["metadata"];
}

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
      logger.error("从本地存储加载通知失败", error);
    }
  };

  // 跨窗口同步
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        notifications.value = JSON.parse(event.newValue);
      } catch (error) {
        logger.error("跨窗口同步通知失败", error);
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
        logger.error("持久化通知失败", error);
      }
    },
    { deep: true }
  );

  // Getters
  const unreadCount = computed(
    () => notifications.value.filter((n) => !n.read).length
  );

  const sortedNotifications = computed(() =>
    [...notifications.value].sort((a, b) => b.timestamp - a.timestamp)
  );

  // Actions
  const createNotification = (
    id: string,
    payload: NotificationPayload
  ): Notification => ({
    id,
    title: payload.title,
    content: payload.content,
    type: payload.type || "info",
    timestamp: Date.now(),
    read: false,
    source: payload.source,
    metadata: payload.metadata,
  });

  const push = (payload: NotificationPayload) => {
    const notification = createNotification(crypto.randomUUID(), payload);
    notifications.value.push(notification);
    return notification.id;
  };

  const upsert = (id: string, payload: NotificationPayload) => {
    const existing = notifications.value.find((item) => item.id === id);
    if (!existing) {
      notifications.value.push(createNotification(id, payload));
      return;
    }

    existing.title = payload.title;
    existing.content = payload.content;
    existing.type = payload.type || "info";
    existing.source = payload.source;
    existing.metadata = payload.metadata;
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
    centerVisible.value =
      visible !== undefined ? visible : !centerVisible.value;
  };

  // 执行加载
  loadNotifications();

  return {
    notifications,
    centerVisible,
    unreadCount,
    sortedNotifications,
    push,
    upsert,
    markRead,
    markAllRead,
    remove,
    clearAll,
    toggleCenter,
  };
});
