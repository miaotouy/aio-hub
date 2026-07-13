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

import { computed } from "vue";
import { useNotificationStore } from "@/stores/notification";
import type {
  NotificationType,
  NotificationMetadata,
} from "@/types/notification";

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
