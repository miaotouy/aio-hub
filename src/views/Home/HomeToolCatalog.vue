<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->

<template>
  <div class="content-section" :class="[`content-style-${cardStyle}`]">
    <div :class="['portal-layout', `layout-${categoryLayout}`]">
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
        <div
          v-if="filteredTools.length > 0"
          :class="['tool-grid', `grid-${cardStyle}`]"
        >
          <el-dropdown
            v-for="tool in filteredTools"
            :key="tool.path"
            class="tool-card-context-menu"
            trigger="contextmenu"
            @command="
              (command: string) => handleToolContextCommand(command, tool.path)
            "
          >
            <div :class="['tool-card-wrapper', `wrapper-${cardStyle}`]">
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
                  `card-${cardStyle}`,
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

                <span class="icon-wrapper">
                  <component :is="tool.icon" />
                </span>
                <div class="tool-info">
                  <div class="tool-name">{{ tool.name }}</div>
                  <div class="tool-description">{{ tool.description }}</div>
                </div>
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
import { useAppSettingsStore } from "@/stores/appSettingsStore";

const appSettingsStore = useAppSettingsStore();
const settings = computed(() => appSettingsStore.settings);

const categoryLayout = computed(
  () => settings.value.homeCategoryLayout ?? "left"
);
const cardStyle = computed(() => settings.value.homeCardStyle ?? "classic");

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
.content-section {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.portal-layout {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  /* 允许子元素收缩 */
  max-width: 1200px;
  gap: 20px;
  padding: 4px 20px 20px;
  box-sizing: border-box;
  margin: 0 auto;
}

/* --- 分类栏布局自适应 --- */
.portal-layout.layout-left {
  flex-direction: row;
  align-items: flex-start;
}

.portal-layout.layout-right {
  flex-direction: row-reverse;
  align-items: flex-start;
}

.portal-layout.layout-top {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.portal-layout.layout-bottom {
  flex-direction: column-reverse;
  align-items: stretch;
  gap: 10px;
}

.category-sidebar {
  flex-shrink: 0;
  display: flex;
  box-sizing: border-box;
}

/* 侧边模式（左/右） */
.layout-left .category-sidebar,
.layout-right .category-sidebar {
  width: 140px;
  height: 100%;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding: 4px 8px 0 4px;
  text-align: left;
}

/* 横排模式（上/下） */
.layout-top .category-sidebar,
.layout-bottom .category-sidebar {
  width: 100%;
  flex-direction: row;
  gap: 8px;
  overflow-x: auto;
  white-space: nowrap;
  padding: 6px 4px;
  scrollbar-width: none;
  /* Firefox */
}

.layout-top .category-sidebar::-webkit-scrollbar,
.layout-bottom .category-sidebar::-webkit-scrollbar {
  display: none;
  /* Chrome/Safari */
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border: none;
  border-radius: 10px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.layout-left .sidebar-item,
.layout-right .sidebar-item {
  width: 100%;
  padding: 10px 12px;
  text-align: left;
}

.layout-top .sidebar-item,
.layout-bottom .sidebar-item {
  width: auto;
  padding: 8px 14px;
  flex-shrink: 0;
  gap: 8px;
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
}

.layout-left .category-name,
.layout-right .category-name {
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
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px 4px 0;
  box-sizing: border-box;
  min-width: 0;
  /* 防止 flex 溢出 */
  overflow-y: auto;
  /* 工具网格独立滚动 */
  scrollbar-gutter: stable;
}

/* --- 网格布局自适应 --- */
.tool-grid {
  display: grid;
  width: 100%;
  box-sizing: border-box;
  padding: 0 0 20px;
}

.tool-grid.grid-classic {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.tool-grid.grid-compact {
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.tool-grid.grid-large {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 24px;
}

.tool-grid.grid-list {
  grid-template-columns: 1fr;
  gap: 12px;
}

.tool-card-context-menu {
  display: block;
}

.tool-card-wrapper {
  position: relative;
  height: 100%;
}

/* --- 卡片样式自适应 --- */
.tool-card {
  height: 100%;
  box-sizing: border-box;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  display: flex;
  text-decoration: none;
  color: var(--text-color);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  cursor: pointer;
}

/* 经典样式 */
.tool-card.card-classic {
  padding: 25px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.tool-card.card-classic:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

/* 紧凑样式 */
.tool-card.card-compact {
  padding: 14px 16px;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.tool-card.card-compact:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  border-color: var(--primary-color);
}

/* 精致样式 */
.tool-card.card-large {
  padding: 30px 25px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.tool-card.card-large:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  border-color: var(--primary-color);
}

/* 列表样式 */
.tool-card.card-list {
  padding: 16px 24px;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;
}

.tool-card.card-list:hover {
  transform: translateX(4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  border-color: var(--primary-color);
}

/* --- 图标样式自适应 --- */
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.card-classic .icon-wrapper {
  width: 48px;
  height: 48px;
  font-size: 48px;
  line-height: 1;
  margin-bottom: 15px;
}

.card-compact .icon-wrapper {
  width: 28px;
  height: 28px;
  font-size: 28px;
  line-height: 1;
}

.card-large .icon-wrapper {
  width: 52px;
  height: 52px;
  font-size: 52px;
  line-height: 1;
  margin-bottom: 20px;
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border-radius: 16px;
  padding: 12px;
  box-sizing: content-box;
  box-shadow: 0 6px 16px rgba(var(--primary-color-rgb), 0.08);
}

.tool-card.card-large:hover .icon-wrapper {
  transform: scale(1.05);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.card-list .icon-wrapper {
  width: 36px;
  height: 36px;
  font-size: 36px;
  line-height: 1;
}

.icon-wrapper svg,
.icon-wrapper img {
  width: 1em;
  height: 1em;
}

/* --- 信息排版自适应 --- */
.tool-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.card-classic .tool-info,
.card-large .tool-info {
  align-items: center;
}

.card-compact .tool-info,
.card-list .tool-info {
  align-items: flex-start;
  text-align: left;
}

.tool-name {
  font-weight: bold;
  color: var(--text-color);
  transition: color 0.2s ease;
}

.card-classic .tool-name {
  font-size: 1.2em;
  margin-bottom: 8px;
}

.card-compact .tool-name {
  font-size: 0.95rem;
  margin-bottom: 2px;
}

.card-large .tool-name {
  font-size: 1.3em;
  font-weight: 800;
  margin-bottom: 10px;
}

.card-list .tool-name {
  font-size: 1.1em;
  margin-bottom: 4px;
}

.tool-card:hover .tool-name {
  color: var(--primary-color);
}

.tool-description {
  font-size: 0.9em;
  color: var(--text-color-light);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-classic .tool-description {
  text-align: center;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  min-height: calc(1.5em * 3);
}

.card-compact .tool-description {
  font-size: 0.75rem;
  line-clamp: 1;
  -webkit-line-clamp: 1;
}

.card-large .tool-description {
  text-align: center;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  min-height: calc(1.5em * 3);
}

.card-list .tool-description {
  line-clamp: 1;
  -webkit-line-clamp: 1;
}

/* --- 固定按钮自适应 --- */
.tool-pin-action {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  /* 去掉边框 */
  background: transparent;
  /* 去掉背景 */
  color: var(--text-color-light);
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    color 0.2s ease;
}

/* 非列表模式下的固定按钮 */
.wrapper-classic .tool-pin-action,
.wrapper-compact .tool-pin-action,
.wrapper-large .tool-pin-action {
  top: 10px;
  right: 10px;
  /* 移到右侧 */
  opacity: 0;
  transform: translateY(2px);
}

.tool-card-wrapper:hover .tool-pin-action,
.tool-card-wrapper:focus-within .tool-pin-action {
  opacity: 1;
  transform: translateY(0);
}

/* 列表模式下的固定按钮 */
.wrapper-list .tool-pin-action {
  right: 20px;
  /* 靠右对齐 */
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.4;
  /* 列表模式下默认半透明常驻，更易触达 */
}

.wrapper-list:hover .tool-pin-action,
.wrapper-list:focus-within .tool-pin-action {
  opacity: 1;
}

.tool-pin-action:hover,
.tool-pin-action:focus-visible,
.tool-pin-action-active {
  color: var(--primary-color);
  outline: none;
  opacity: 1 !important;
}

.tool-pin-action .el-icon {
  margin: 0;
  color: inherit;
}

/* --- 分离状态样式自适应 --- */
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
  z-index: 10;
}

.card-classic .detached-badge-dropdown,
.card-compact .detached-badge-dropdown,
.card-large .detached-badge-dropdown {
  top: 10px;
  left: 10px;
  /* 移到左侧，避免与右侧的收藏按钮重叠 */
}

.card-list .detached-badge-dropdown {
  right: 56px;
  /* 列表模式下避开右侧的固定按钮 */
  top: 50%;
  transform: translateY(-50%);
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

/* --- 空状态与基础样式 --- */
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
</style>
