<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->

<template>
  <div class="quick-access-section">
    <div class="quick-access-cards">
      <VueDraggableNext
        v-model="quickAccessToolsModel"
        class="quick-access-draggable"
        item-key="path"
        :animation="180"
        :force-fallback="true"
        :delay="120"
        :touch-start-threshold="5"
        ghost-class="quick-card-ghost"
        chosen-class="quick-card-chosen"
        @start="quickAccessDragging = true"
        @end="handleQuickAccessDragEnd"
      >
        <el-dropdown
          v-for="tool in quickAccessToolsModel"
          :key="tool.path"
          trigger="contextmenu"
          @command="
            (command: string) => handleQuickAccessCommand(command, tool.path)
          "
        >
          <component
            :is="
              isDetached(getToolIdFromPath(tool.path)) ? 'div' : 'router-link'
            "
            :to="
              isDetached(getToolIdFromPath(tool.path)) ? undefined : tool.path
            "
            class="quick-card"
            :class="{ 'quick-card-dragging': quickAccessDragging }"
            :title="`${tool.name}（可拖拽排序，右键管理）`"
            @click="emit('toolClick', tool.path)"
          >
            <span class="quick-card-icon">
              <component :is="tool.icon" />
            </span>
            <span class="quick-card-name">{{ tool.name }}</span>
          </component>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="unpin">从快捷栏移除</el-dropdown-item>
              <el-dropdown-item command="manage">管理快捷栏</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </VueDraggableNext>

      <el-popover
        v-model:visible="managerVisibleModel"
        placement="bottom"
        :width="360"
        trigger="click"
        popper-class="quick-manage-popover"
      >
        <template #reference>
          <button
            class="quick-card quick-card-manage"
            title="管理快捷栏"
            aria-label="管理快捷栏"
          >
            <span class="quick-card-icon quick-card-manage-icon">
              <el-icon><i-ep-setting /></el-icon>
            </span>
            <span class="quick-card-name">管理</span>
          </button>
        </template>
        <div class="quick-manage-panel">
          <div class="quick-manage-header">
            <div>
              <div class="quick-manage-title">快捷栏管理</div>
              <div class="quick-manage-hint">
                已固定 {{ managerPinnedToolsModel.length }}/{{ maxItems }}
                项，可拖拽排序
              </div>
            </div>
            <el-button
              text
              type="primary"
              size="small"
              @click="emit('restore')"
            >
              恢复推荐
            </el-button>
          </div>

          <VueDraggableNext
            v-model="managerPinnedToolsModel"
            class="quick-manage-list"
            item-key="path"
            :animation="180"
            :force-fallback="true"
            handle=".quick-manage-drag-handle"
            ghost-class="quick-manage-item-ghost"
            @end="emit('managerPinnedDragEnd')"
          >
            <div
              v-for="tool in managerPinnedToolsModel"
              :key="tool.path"
              class="quick-manage-item"
              :class="{ 'quick-manage-item-hidden': !isToolVisible(tool.path) }"
            >
              <el-icon class="quick-manage-drag-handle" title="拖拽排序">
                <Menu :size="16" :stroke-width="2" />
              </el-icon>
              <span class="quick-manage-item-icon"
                ><component :is="tool.icon"
              /></span>
              <span class="quick-manage-item-name">{{ tool.name }}</span>
              <span
                v-if="!isToolVisible(tool.path)"
                class="quick-manage-hidden-label"
              >
                已隐藏
              </span>
              <button
                class="quick-manage-remove"
                type="button"
                :aria-label="`从快捷栏移除 ${tool.name}`"
                :title="`从快捷栏移除 ${tool.name}`"
                @click="emit('unpin', tool.path)"
              >
                <el-icon><i-ep-close /></el-icon>
              </button>
            </div>
          </VueDraggableNext>

          <div
            v-if="managerPinnedToolsModel.length === 0"
            class="quick-manage-empty"
          >
            快捷栏为空，可从下方选择工具或在工具卡片上右键固定。
          </div>

          <el-select
            v-model="managerSelectedPath"
            :disabled="managerPinnedToolsModel.length >= maxItems"
            filterable
            filter-placeholder="搜索工具"
            placeholder="添加工具到快捷栏"
            class="quick-manage-select"
            @change="handleManagerToolSelected"
          >
            <el-option-group
              v-for="group in availableToolsToPinGroups"
              :key="group.label"
              :label="group.label"
            >
              <el-option
                v-for="tool in group.tools"
                :key="tool.path"
                :label="tool.name"
                :value="tool.path"
              >
                <div class="quick-manage-select-option">
                  <span class="quick-manage-select-option-icon">
                    <component :is="tool.icon" />
                  </span>
                  <span class="quick-manage-select-option-name">{{
                    tool.name
                  }}</span>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
          <div
            v-if="managerPinnedToolsModel.length >= maxItems"
            class="quick-manage-capacity-hint"
          >
            快捷栏已满；可移除一个工具，或在工具卡片上选择替换。
          </div>
        </div>
      </el-popover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Menu } from "lucide-vue-next";
import { VueDraggableNext } from "vue-draggable-next";
import type { ToolConfig } from "@/services/types";

type ToolGroup = {
  label: string;
  tools: ToolConfig[];
};

const props = defineProps<{
  quickAccessTools: ToolConfig[];
  managerPinnedTools: ToolConfig[];
  managerVisible: boolean;
  availableToolsToPinGroups: ToolGroup[];
  maxItems: number;
  getToolIdFromPath: (path: string) => string;
  isDetached: (toolId: string) => boolean;
  isToolVisible: (path: string) => boolean;
}>();

const emit = defineEmits<{
  "update:quickAccessTools": [tools: ToolConfig[]];
  "update:managerPinnedTools": [tools: ToolConfig[]];
  "update:managerVisible": [visible: boolean];
  quickAccessDragEnd: [];
  managerPinnedDragEnd: [];
  toolClick: [path: string];
  pin: [path: string];
  unpin: [path: string];
  restore: [];
}>();

const quickAccessDragging = ref(false);
const managerSelectedPath = ref("");

const quickAccessToolsModel = computed({
  get: () => props.quickAccessTools,
  set: (tools: ToolConfig[]) => emit("update:quickAccessTools", tools),
});
const managerPinnedToolsModel = computed({
  get: () => props.managerPinnedTools,
  set: (tools: ToolConfig[]) => emit("update:managerPinnedTools", tools),
});
const managerVisibleModel = computed({
  get: () => props.managerVisible,
  set: (visible: boolean) => emit("update:managerVisible", visible),
});

function handleQuickAccessDragEnd(): void {
  quickAccessDragging.value = false;
  emit("quickAccessDragEnd");
}

function handleQuickAccessCommand(command: string, toolPath: string): void {
  if (command === "unpin") {
    emit("unpin", toolPath);
  } else if (command === "manage") {
    managerVisibleModel.value = true;
  }
}

function handleManagerToolSelected(toolPath: string): void {
  managerSelectedPath.value = "";
  emit("pin", toolPath);
}
</script>

<style scoped>
.quick-access-section {
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 1200px;
  margin-bottom: 15px;
}
.quick-access-cards,
.quick-access-draggable {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.quick-access-cards {
  align-items: flex-start;
}
.quick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 80px;
  height: 80px;
  border-radius: 12px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  text-decoration: none;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
  font-family: inherit;
  font-size: inherit;
  padding: 0;
  user-select: none;
}
.quick-card:hover,
.quick-card:focus-visible {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(var(--primary-color-rgb), 0.15);
  outline: none;
}
.quick-card-dragging {
  cursor: grab;
}
.quick-card-ghost {
  opacity: 0.45;
}
.quick-card-chosen {
  border-color: var(--primary-color);
}
.quick-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 28px;
  line-height: 1;
  color: var(--primary-color);
}
.quick-card-icon svg,
.quick-card-icon img {
  width: 1em;
  height: 1em;
}
.quick-card-name {
  font-size: 0.75rem;
  color: var(--text-color);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 68px;
  line-height: 1.2;
}
.quick-card-manage {
  border-style: dashed;
  background: transparent;
}
.quick-card-manage:hover {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}
.quick-card-manage-icon,
.quick-card-manage .quick-card-name {
  color: var(--text-color-light);
}
.quick-card-manage-icon .el-icon {
  margin: 0;
  color: inherit;
}
.quick-manage-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.quick-manage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.quick-manage-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
}
.quick-manage-hint,
.quick-manage-capacity-hint {
  margin-top: 3px;
  font-size: 0.75rem;
  color: var(--text-color-light);
  line-height: 1.4;
}
.quick-manage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: none;
  -webkit-user-select: none;
}
.quick-manage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 6px 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--text-color);
}
.quick-manage-item-hidden {
  opacity: 0.65;
}
.quick-manage-item-ghost {
  opacity: 0.45;
}
.quick-manage-item .quick-manage-drag-handle {
  display: inline-flex;
  flex: 0 0 20px;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 26px;
  margin: 0;
  color: var(--text-color-light);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.quick-manage-item .quick-manage-drag-handle:active {
  cursor: grabbing;
}
.quick-manage-item-icon,
.quick-replacement-option-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  flex-shrink: 0;
}
.quick-manage-item-icon :deep(svg),
.quick-manage-item-icon :deep(img),
.quick-replacement-option-icon :deep(svg),
.quick-replacement-option-icon :deep(img) {
  width: 1em;
  height: 1em;
}
.quick-manage-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}
.quick-manage-hidden-label {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color-light);
  font-size: 0.7rem;
  flex-shrink: 0;
}
.quick-manage-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  color: var(--text-color-light);
  background: transparent;
  cursor: pointer;
}
.quick-manage-remove:hover,
.quick-manage-remove:focus-visible {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  outline: none;
}
.quick-manage-remove .el-icon {
  margin: 0;
  color: inherit;
}
.quick-manage-empty {
  padding: 10px;
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-color-light);
  font-size: 0.8rem;
  line-height: 1.5;
  text-align: left;
}
.quick-manage-select {
  width: 100%;
}
.quick-manage-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.quick-manage-select-option-icon {
  display: inline-flex;
  flex: 0 0 20px;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--primary-color);
}
.quick-manage-select-option-icon :deep(svg),
.quick-manage-select-option-icon :deep(img) {
  width: 1em;
  height: 1em;
}
.quick-manage-select-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
