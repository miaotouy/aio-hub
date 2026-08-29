<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->

<template>
  <div class="content-section">
    <div class="portal-layout">
      <div v-if="categories.length > 1" class="category-sidebar">
        <button
          v-for="category in categories"
          :key="category"
          class="sidebar-item"
          :class="{ active: selectedCategory === category }"
          @click="selectedCategory = category"
        >
          <span class="category-name">{{ category }}</span>
          <span class="category-badge">{{ getCategoryCount(category) }}</span>
        </button>
      </div>

      <div class="tool-grid-container">
        <div v-if="filteredTools.length > 0" class="tool-grid">
          <el-dropdown
            v-for="tool in filteredTools"
            :key="tool.path"
            class="tool-card-context-menu"
            trigger="contextmenu"
            @command="
              (command: string) => handleToolContextCommand(command, tool.path)
            "
          >
            <div class="tool-card-wrapper">
              <component
                :is="
                  isDetached(getToolIdFromPath(tool.path))
                    ? 'div'
                    : 'router-link'
                "
                :to="
                  isDetached(getToolIdFromPath(tool.path))
                    ? undefined
                    : tool.path
                "
                :class="[
                  'tool-card',
                  {
                    'tool-card-detached': isDetached(
                      getToolIdFromPath(tool.path)
                    ),
                  },
                ]"
                @click="emit('toolClick', tool.path)"
              >
                <el-dropdown
                  v-if="isDetached(getToolIdFromPath(tool.path))"
                  class="detached-badge-dropdown"
                  trigger="hover"
                  @command="
                    (command: string) =>
                      emit('detachedCommand', command, tool.path)
                  "
                >
                  <div class="detached-badge" @click.stop>
                    <el-icon><i-ep-full-screen /></el-icon>
                  </div>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="cancel"
                        >取消分离</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <span class="icon-wrapper"><component :is="tool.icon" /></span>
                <div class="tool-name">{{ tool.name }}</div>
                <div class="tool-description">{{ tool.description }}</div>
              </component>
              <button
                class="tool-pin-action"
                :class="{ 'tool-pin-action-active': isToolPinned(tool.path) }"
                type="button"
                :title="getPinActionLabel(tool.path)"
                :aria-label="getPinActionLabel(tool.path)"
                @click.stop="emit('togglePin', tool.path)"
              >
                <el-icon>
                  <i-ep-star-filled v-if="isToolPinned(tool.path)" />
                  <i-ep-star v-else />
                </el-icon>
              </button>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="toggle-pin">
                  {{ getPinActionLabel(tool.path) }}
                </el-dropdown-item>
                <el-dropdown-item command="manage">管理快捷栏</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div v-else class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">
            {{ tools.length === 0 ? "没有可显示的工具" : "未找到匹配的工具" }}
          </div>
          <el-button
            v-if="tools.length === 0"
            type="primary"
            @click="emit('goSettings')"
          >
            前往设置页面配置工具
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ToolConfig } from "@/services/types";

const props = defineProps<{
  tools: ToolConfig[];
  allTools: ToolConfig[];
  searchText: string;
  getToolIdFromPath: (path: string) => string;
  getPinActionLabel: (path: string) => string;
  isDetached: (toolId: string) => boolean;
  isToolPinned: (path: string) => boolean;
}>();

const emit = defineEmits<{
  toolClick: [path: string];
  togglePin: [path: string];
  openManager: [];
  detachedCommand: [command: string, path: string];
  goSettings: [];
}>();

const selectedCategory = ref("全部");

const categories = computed(() => {
  const categories = new Set<string>(["全部"]);
  props.allTools.forEach((tool) => {
    if (!tool.category) return;
    if (Array.isArray(tool.category)) {
      tool.category.forEach((category) => categories.add(category));
    } else {
      categories.add(tool.category);
    }
  });
  return [...categories];
});

const filteredTools = computed(() => {
  let result = [...props.tools];

  if (selectedCategory.value !== "全部") {
    result = result.filter((tool) =>
      Array.isArray(tool.category)
        ? tool.category.includes(selectedCategory.value)
        : tool.category === selectedCategory.value
    );
  }

  if (props.searchText.trim()) {
    const search = props.searchText.toLowerCase();
    result = result.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search) ||
        tool.description?.toLowerCase().includes(search)
    );
  }

  return result;
});

function getCategoryCount(category: string): number {
  if (category === "全部") return props.tools.length;

  return props.tools.filter((tool) =>
    Array.isArray(tool.category)
      ? tool.category.includes(category)
      : tool.category === category
  ).length;
}

function handleToolContextCommand(command: string, toolPath: string): void {
  if (command === "toggle-pin") {
    emit("togglePin", toolPath);
  } else if (command === "manage") {
    emit("openManager");
  }
}
</script>

<style scoped>
.portal-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  max-width: 1200px;
  gap: 20px;
  align-items: flex-start;
  padding: 4px 20px 0;
  box-sizing: border-box;
}
.category-sidebar {
  width: 140px;
  flex-shrink: 0;
  position: sticky;
  top: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  padding: 4px 8px 0 4px;
  text-align: left;
  box-sizing: border-box;
}
.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 10px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  text-align: left;
  box-sizing: border-box;
}
.sidebar-item:hover {
  background: var(--input-bg);
}
.sidebar-item.active {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  color: var(--primary-color);
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(var(--primary-color-rgb), 0.1);
  backdrop-filter: blur(var(--ui-blur));
}
.category-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}
.category-badge {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-color-light);
  flex-shrink: 0;
}
.sidebar-item.active .category-badge {
  background: var(--primary-color);
  color: white;
}
.tool-grid-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 4px 4px 0;
  box-sizing: border-box;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  padding: 0 0 20px;
  width: 100%;
  box-sizing: border-box;
}
.tool-card-context-menu {
  display: block;
}
.tool-card-wrapper {
  position: relative;
  height: 100%;
}
.tool-card {
  height: 100%;
  box-sizing: border-box;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  padding: 25px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  text-decoration: none;
  color: var(--text-color);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  cursor: pointer;
}
.tool-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}
.tool-pin-action {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color-light);
  background: var(--card-bg);
  cursor: pointer;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    color 0.2s ease;
}
.tool-card-wrapper:hover .tool-pin-action,
.tool-card-wrapper:focus-within .tool-pin-action {
  opacity: 1;
  transform: translateY(0);
}
.tool-pin-action:hover,
.tool-pin-action:focus-visible,
.tool-pin-action-active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  outline: none;
}
.tool-pin-action .el-icon {
  margin: 0;
  color: inherit;
}
.el-icon {
  margin-bottom: 15px;
  color: var(--primary-color);
}
.tool-name {
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--text-color);
}
.tool-description {
  font-size: 0.9em;
  color: var(--text-color-light);
  text-align: center;
  line-height: 1.5;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: calc(1.5em * 3);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
  margin-top: 2rem;
}
.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}
.empty-text {
  font-size: 1rem;
  margin-bottom: 1.5rem;
}
.tool-card-detached {
  position: relative;
  border-color: var(--primary-color);
  background: linear-gradient(
    135deg,
    var(--card-bg) 0%,
    rgba(var(--primary-color-rgb), 0.05) 100%
  );
}
.tool-card-detached::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px solid var(--primary-color);
  border-radius: 12px;
  opacity: 0.3;
  pointer-events: none;
}
.detached-badge-dropdown {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}
.detached-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: white;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}
.detached-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.detached-badge .el-icon {
  font-size: 16px;
  margin: 0;
}
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 48px;
  line-height: 1;
  margin-bottom: 15px;
  color: var(--primary-color);
}
.icon-wrapper svg,
.icon-wrapper img {
  width: 1em;
  height: 1em;
}
</style>
