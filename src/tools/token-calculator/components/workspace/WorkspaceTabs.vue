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
  <div class="workspace-tabs">
    <div class="tabs-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: modelValue === tab.id }]"
        :title="tab.tooltip"
        @click="emit('update:modelValue', tab.id)"
      >
        <el-icon :size="14" class="tab-icon">
          <component :is="tab.icon" />
        </el-icon>
        <span class="tab-label">{{ tab.label }}</span>
        <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
      </button>
    </div>
    <div class="tabs-content">
      <slot :active-tab="modelValue" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";

export interface WorkspaceTabDef {
  id: string;
  label: string;
  icon: Component;
  tooltip?: string;
  badge?: string | number;
}

interface Props {
  modelValue: string;
  tabs: WorkspaceTabDef[];
}

defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
}>();
</script>

<style scoped>
.workspace-tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.tabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px 0 12px;
  flex-shrink: 0;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: transparent;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-color-secondary);
  background-color: transparent;
  border: var(--border-width) solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition:
    color 0.2s,
    background-color 0.2s,
    border-color 0.2s;
  position: relative;
  margin-bottom: -1px;
}

.tab-btn:hover {
  color: var(--text-color);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.tab-btn.active {
  color: var(--primary-color);
  background-color: var(--card-bg);
  border-color: var(--border-color);
  border-bottom-color: var(--card-bg);
  font-weight: 600;
}

.tab-icon {
  flex-shrink: 0;
}

.tab-label {
  white-space: nowrap;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--primary-color);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border-radius: 9px;
}

.tabs-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
