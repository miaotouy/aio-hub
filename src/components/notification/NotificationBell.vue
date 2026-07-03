<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed } from "vue";
import { Bell } from "lucide-vue-next";
import { useNotificationStore } from "@/stores/notification";

const store = useNotificationStore();

const unreadCount = computed(() => store.unreadCount);

const handleClick = () => {
  store.toggleCenter();
};
</script>

<template>
  <div class="notification-bell" :class="{ 'has-unread': unreadCount > 0 }">
    <el-tooltip
      :content="unreadCount > 0 ? `${unreadCount} 条未读消息` : '消息中心'"
      placement="bottom"
    >
      <button class="control-btn bell-btn" @click="handleClick">
        <el-badge
          :value="unreadCount"
          :max="99"
          :hidden="unreadCount === 0"
          class="bell-badge"
        >
          <div class="bell-icon-wrapper">
            <Bell :size="18" />
          </div>
        </el-badge>
      </button>
    </el-tooltip>
  </div>
</template>

<style scoped>
.notification-bell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn {
  width: 46px;
  height: var(--titlebar-height);
  border: none;
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

/* 消息铃铛不需要 TitleBar 那种背景清除，它应该保持 hover 效果 */
.control-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.bell-badge :deep(.el-badge__content) {
  top: 6px;
  right: 4px;
  transform: scale(0.8);
  border: none;
  background-color: var(--el-color-primary);
}

.bell-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}

.has-unread .bell-icon-wrapper {
  animation: bell-swing 2s infinite ease-in-out;
}

@keyframes bell-swing {
  0%,
  100% {
    transform: rotate(0deg);
  }
  5% {
    transform: rotate(15deg);
  }
  10% {
    transform: rotate(-15deg);
  }
  15% {
    transform: rotate(10deg);
  }
  20% {
    transform: rotate(-10deg);
  }
  25% {
    transform: rotate(0deg);
  }
}
</style>
