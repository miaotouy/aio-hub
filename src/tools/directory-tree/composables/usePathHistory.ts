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

/**
 * 路径历史记录管理
 */
import { ref, computed } from "vue";
import type { PathHistoryItem } from "../config";

export function usePathHistory() {
  const pathHistory = ref<PathHistoryItem[]>([]);

  // 排序后的历史记录（按访问时间倒序）
  const sortedPathHistory = computed(() => {
    return [...pathHistory.value].sort(
      (a, b) => b.lastAccessTime - a.lastAccessTime
    );
  });

  // 添加路径到历史记录
  const addToHistory = (path: string) => {
    if (!path) return;

    const existingIndex = pathHistory.value.findIndex(
      (item) => item.path === path
    );
    if (existingIndex !== -1) {
      // 更新已存在的记录
      pathHistory.value[existingIndex].lastAccessTime = Date.now();
      pathHistory.value[existingIndex].accessCount++;
    } else {
      // 添加新记录
      pathHistory.value.push({
        path,
        lastAccessTime: Date.now(),
        accessCount: 1,
      });
    }

    // 限制历史记录数量为 20 条
    if (pathHistory.value.length > 20) {
      pathHistory.value = pathHistory.value
        .sort((a, b) => b.lastAccessTime - a.lastAccessTime)
        .slice(0, 20);
    }
  };

  // 移除历史路径
  const removeHistoryPath = (path: string) => {
    pathHistory.value = pathHistory.value.filter((item) => item.path !== path);
  };

  // 清空历史记录
  const clearHistory = () => {
    pathHistory.value = [];
  };

  // 格式化历史时间
  const formatHistoryTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString();
  };

  return {
    pathHistory,
    sortedPathHistory,
    addToHistory,
    removeHistoryPath,
    clearHistory,
    formatHistoryTime,
  };
}
