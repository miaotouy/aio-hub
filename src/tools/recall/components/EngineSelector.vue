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
  <div class="engine-selector">
    <div
      v-for="engine in recallStore.engines"
      :key="engine.id"
      class="engine-item"
      :class="{ active: modelValue === engine.id }"
      @click="$emit('update:modelValue', engine.id)"
    >
      <div class="engine-icon">
        <Icon :icon="engine.icon || 'lucide:cpu'" :width="16" :height="16" />
      </div>
      <div class="engine-info">
        <div class="engine-name">{{ engine.name }}</div>
        <div class="engine-desc">{{ engine.description }}</div>
      </div>
      <div v-if="modelValue === engine.id" class="active-indicator">
        <Check :size="14" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check } from "lucide-vue-next";
import { Icon } from "@iconify/vue";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  (e: "update:modelValue", id: string): void;
}>();

const recallStore = useRecallCollectionStore();
</script>

<style scoped>
.engine-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--input-bg);
  position: relative;
}

.engine-item:hover {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.02);
}

.engine-item.active {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.engine-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.engine-info {
  flex: 1;
  min-width: 0;
}

.engine-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 2px;
}

.engine-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-indicator {
  color: var(--el-color-primary);
}
</style>
