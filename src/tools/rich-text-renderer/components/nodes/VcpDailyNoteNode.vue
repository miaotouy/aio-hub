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

<template>
  <div class="vcp-daily-note-container" :class="{ 'is-pending': !closed }">
    <div class="vcp-daily-note-header" @click="isCollapsed = !isCollapsed">
      <div class="note-title">
        <span
          class="vcp-collapse-icon"
          :class="{ 'is-expanded': !isCollapsed }"
        >
          <ChevronRight :size="14" />
        </span>
        <BookOpen class="note-icon" :size="14" />
        <span class="note-name">日记记录</span>
      </div>
      <div v-if="!closed" class="pending-indicator">
        <Loader2 class="spinning" :size="12" />
        <span>记录中...</span>
      </div>
    </div>
    <div v-show="!isCollapsed" class="vcp-daily-note-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { BookOpen, Loader2, ChevronRight } from "lucide-vue-next";

defineProps<{
  nodeId: string;
  closed: boolean;
}>();

const isCollapsed = ref(false);
</script>

<style scoped>
.vcp-daily-note-container {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  background: var(--card-bg, rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(var(--ui-blur, 8px));
  overflow: hidden;
  transition: all 0.3s ease;
}

.vcp-daily-note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: var(--border-width) solid var(--border-color);
  cursor: pointer;
  user-select: none;
}

.note-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vcp-collapse-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  opacity: 0.5;
}

.vcp-collapse-icon.is-expanded {
  transform: rotate(90deg);
}

.note-icon {
  color: var(--el-color-warning);
  opacity: 0.8;
}

.note-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-warning);
}

.pending-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-color-warning);
  opacity: 0.8;
}

.vcp-daily-note-content {
  padding: 12px;
}

.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.is-pending {
  border-style: dashed;
  border-color: var(--el-color-warning);
}
</style>
