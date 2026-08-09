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
  <div class="home-page">
    <div class="header-section">
      <div class="quick-access-section">
        <div class="quick-access-cards">
          <VueDraggableNext
            v-model="quickAccessDragTools"
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
              v-for="tool in quickAccessDragTools"
              :key="tool.path"
              trigger="contextmenu"
              @command="
                (command: string) =>
                  handleQuickAccessCommand(command, tool.path)
              "
            >
              <component
                :is="
                  detachedManager.isDetached(getToolIdFromPath(tool.path))
                    ? 'div'
                    : 'router-link'
                "
                :to="
                  detachedManager.isDetached(getToolIdFromPath(tool.path))
                    ? undefined
                    : tool.path
                "
                class="quick-card"
                :class="{ 'quick-card-dragging': quickAccessDragging }"
                :title="`${tool.name}（可拖拽排序，右键管理）`"
                @click="handleToolClick(tool.path)"
              >
                <span class="quick-card-icon">
                  <component :is="tool.icon" />
                </span>
                <span class="quick-card-name">{{ tool.name }}</span>
              </component>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="unpin">
                    从快捷栏移除
                  </el-dropdown-item>
                  <el-dropdown-item command="manage">
                    管理快捷栏
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </VueDraggableNext>

          <el-popover
            v-model:visible="quickManageVisible"
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
                    已固定 {{ managerPinnedTools.length }}/{{
                      QUICK_ACCESS_MAX_ITEMS
                    }}
                    项，可拖拽排序
                  </div>
                </div>
                <el-button
                  text
                  type="primary"
                  size="small"
                  @click="handleRestoreDefaultPinnedTools"
                >
                  恢复推荐
                </el-button>
              </div>

              <VueDraggableNext
                v-model="managerPinnedTools"
                class="quick-manage-list"
                item-key="path"
                :animation="180"
                :force-fallback="true"
                ghost-class="quick-manage-item-ghost"
                @end="handleManagerPinnedDragEnd"
              >
                <div
                  v-for="tool in managerPinnedTools"
                  :key="tool.path"
                  class="quick-manage-item"
                  :class="{
                    'quick-manage-item-hidden': !isToolVisible(tool.path),
                  }"
                >
                  <el-icon class="quick-manage-drag-handle" title="拖拽排序">
                    <i-ep-rank />
                  </el-icon>
                  <span class="quick-manage-item-icon">
                    <component :is="tool.icon" />
                  </span>
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
                    @click="handleUnpinTool(tool.path)"
                  >
                    <el-icon><i-ep-close /></el-icon>
                  </button>
                </div>
              </VueDraggableNext>

              <div
                v-if="managerPinnedTools.length === 0"
                class="quick-manage-empty"
              >
                快捷栏为空，可从下方选择工具或在工具卡片上右键固定。
              </div>

              <el-select
                v-model="managerSelectedPath"
                :disabled="managerPinnedTools.length >= QUICK_ACCESS_MAX_ITEMS"
                placeholder="添加工具到快捷栏"
                class="quick-manage-select"
                @change="handleManagerToolSelected"
              >
                <el-option
                  v-for="tool in availableToolsToPin"
                  :key="tool.path"
                  :label="tool.name"
                  :value="tool.path"
                />
              </el-select>
              <div
                v-if="managerPinnedTools.length >= QUICK_ACCESS_MAX_ITEMS"
                class="quick-manage-capacity-hint"
              >
                快捷栏已满；可移除一个工具，或在工具卡片上选择替换。
              </div>
            </div>
          </el-popover>
        </div>
      </div>

      <div class="search-bar">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索工具..."
          class="search-input"
        />
      </div>
    </div>

    <div class="content-section">
      <div class="portal-layout">
        <div v-if="categories.length > 1" class="category-sidebar">
          <button
            v-for="category in categories"
            :key="category"
            @click="selectedCategory = category"
            :class="{ active: selectedCategory === category }"
            class="sidebar-item"
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
                (command: string) =>
                  handleToolContextCommand(command, tool.path)
              "
            >
              <div class="tool-card-wrapper">
                <component
                  :is="
                    detachedManager.isDetached(getToolIdFromPath(tool.path))
                      ? 'div'
                      : 'router-link'
                  "
                  :to="
                    detachedManager.isDetached(getToolIdFromPath(tool.path))
                      ? undefined
                      : tool.path
                  "
                  :class="[
                    'tool-card',
                    {
                      'tool-card-detached': detachedManager.isDetached(
                        getToolIdFromPath(tool.path)
                      ),
                    },
                  ]"
                  @click="handleToolClick(tool.path)"
                >
                  <el-dropdown
                    v-if="
                      detachedManager.isDetached(getToolIdFromPath(tool.path))
                    "
                    class="detached-badge-dropdown"
                    trigger="hover"
                    @command="
                      (command: string) =>
                        handleDropdownCommand(command, tool.path)
                    "
                  >
                    <div class="detached-badge" @click.stop>
                      <el-icon><i-ep-full-screen /></el-icon>
                    </div>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="cancel">
                          取消分离
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>

                  <span class="icon-wrapper">
                    <component :is="tool.icon" />
                  </span>
                  <div class="tool-name">{{ tool.name }}</div>
                  <div class="tool-description">{{ tool.description }}</div>
                </component>
                <button
                  class="tool-pin-action"
                  :class="{ 'tool-pin-action-active': isToolPinned(tool.path) }"
                  type="button"
                  :title="getPinActionLabel(tool.path)"
                  :aria-label="getPinActionLabel(tool.path)"
                  @click.stop="handleToolPinAction(tool.path)"
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
                  <el-dropdown-item command="manage">
                    管理快捷栏
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div v-else class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">
              {{
                visibleTools.length === 0
                  ? "没有可显示的工具"
                  : "未找到匹配的工具"
              }}
            </div>
            <el-button
              v-if="visibleTools.length === 0"
              type="primary"
              @click="router.push('/settings')"
            >
              前往设置页面配置工具
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="replacementDialogVisible"
      title="选择要替换的快捷工具"
      width="420px"
      append-to-body
    >
      <p class="quick-replacement-description">
        将“{{ replacementCandidate?.name }}”固定到快捷栏，需要替换其中一个工具。
      </p>
      <el-radio-group v-model="replacementPath" class="quick-replacement-list">
        <el-radio
          v-for="tool in managerPinnedTools"
          :key="tool.path"
          :label="tool.path"
          class="quick-replacement-option"
        >
          <span class="quick-replacement-option-icon">
            <component :is="tool.icon" />
          </span>
          {{ tool.name }}
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="replacementDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!replacementPath"
          @click="confirmQuickAccessReplacement"
        >
          替换并固定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { VueDraggableNext } from "vue-draggable-next";
import type { ToolConfig } from "@/services/types";
import { useRouter } from "vue-router";
import { useDetachedManager } from "../composables/useDetachedManager";
import { QUICK_ACCESS_MAX_ITEMS, useToolsStore } from "@/stores/tools";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";

const router = useRouter();
const toolsStore = useToolsStore();
const appSettingsStore = useAppSettingsStore();
const detachedManager = useDetachedManager();
const errorHandler = createModuleErrorHandler("HomePage");

const searchText = ref("");
const selectedCategory = ref("全部");
const quickManageVisible = ref(false);
const quickAccessDragging = ref(false);
const quickAccessDragTools = ref<ToolConfig[]>([]);
const managerPinnedTools = ref<ToolConfig[]>([]);
const managerSelectedPath = ref("");
const replacementDialogVisible = ref(false);
const replacementCandidate = ref<ToolConfig | null>(null);
const replacementPath = ref("");

const getCategoryCount = (category: string): number => {
  if (category === "全部") return visibleTools.value.length;

  return visibleTools.value.filter((tool) => {
    if (!tool.category) return false;
    return Array.isArray(tool.category)
      ? tool.category.includes(category)
      : tool.category === category;
  }).length;
};

const getToolIdFromPath = (path: string): string =>
  path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const settings = computed(() => appSettingsStore.settings);
const categories = computed(() => {
  const categories = new Set<string>(["全部"]);
  toolsStore.orderedTools.forEach((tool) => {
    if (!tool.category) return;
    if (Array.isArray(tool.category)) {
      tool.category.forEach((category) => categories.add(category));
    } else {
      categories.add(tool.category);
    }
  });
  return [...categories];
});

const visibleTools = computed(() => {
  if (!settings.value.toolsVisible) return toolsStore.orderedTools;

  return toolsStore.orderedTools.filter((tool) => {
    const isVisible =
      settings.value.toolsVisible![getToolIdFromPath(tool.path)];
    return isVisible !== false;
  });
});

const visiblePinnedTools = computed(() => {
  const visiblePaths = new Set(visibleTools.value.map((tool) => tool.path));
  return toolsStore.pinnedQuickAccessTools.filter((tool) =>
    visiblePaths.has(tool.path)
  );
});

const availableToolsToPin = computed(() => {
  const pinnedPaths = new Set(toolsStore.effectivePinnedQuickAccessPaths);
  return visibleTools.value.filter((tool) => !pinnedPaths.has(tool.path));
});

const filteredTools = computed(() => {
  let result = [...visibleTools.value];

  if (selectedCategory.value !== "全部") {
    result = result.filter((tool) => {
      if (!tool.category) return false;
      return Array.isArray(tool.category)
        ? tool.category.includes(selectedCategory.value)
        : tool.category === selectedCategory.value;
    });
  }

  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    result = result.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search) ||
        tool.description?.toLowerCase().includes(search)
    );
  }

  return result;
});

function isToolVisible(toolPath: string): boolean {
  return visibleTools.value.some((tool) => tool.path === toolPath);
}

function isToolPinned(toolPath: string): boolean {
  return toolsStore.effectivePinnedQuickAccessPaths.includes(toolPath);
}

function getPinActionLabel(toolPath: string): string {
  return isToolPinned(toolPath) ? "从快捷栏移除" : "固定到快捷栏";
}

function syncQuickAccessTools(): void {
  quickAccessDragTools.value = [...visiblePinnedTools.value];
}

function syncManagerPinnedTools(): void {
  managerPinnedTools.value = [...toolsStore.pinnedQuickAccessTools];
}

function openQuickAccessManager(): void {
  syncManagerPinnedTools();
  quickManageVisible.value = true;
}

function handleQuickAccessDragEnd(): void {
  quickAccessDragging.value = false;
  const visiblePathSet = new Set(
    visiblePinnedTools.value.map((tool) => tool.path)
  );
  const orderedVisiblePaths = quickAccessDragTools.value.map(
    (tool) => tool.path
  );
  let visibleIndex = 0;

  const reorderedPaths = toolsStore.pinnedQuickAccessTools.map((tool) =>
    visiblePathSet.has(tool.path)
      ? orderedVisiblePaths[visibleIndex++]
      : tool.path
  );
  toolsStore.reorderPinnedQuickAccess(reorderedPaths);
}

function handleManagerPinnedDragEnd(): void {
  toolsStore.reorderPinnedQuickAccess(
    managerPinnedTools.value.map((tool) => tool.path)
  );
}

function showPinResult(
  result: ReturnType<typeof toolsStore.pinQuickAccess>
): void {
  if (result === "success") {
    customMessage.success("已固定到快捷栏");
  } else if (result === "already-pinned") {
    customMessage.info("该工具已固定到快捷栏");
  } else if (result === "not-found") {
    customMessage.error("该工具当前不可用，无法固定");
  }
}

function requestPinTool(toolPath: string): void {
  const tool = toolsStore.tools.find((item) => item.path === toolPath);
  if (!tool) {
    customMessage.error("该工具当前不可用，无法固定");
    return;
  }

  const result = toolsStore.pinQuickAccess(toolPath);
  if (result === "full") {
    replacementCandidate.value = tool;
    replacementPath.value =
      managerPinnedTools.value[0]?.path ??
      toolsStore.pinnedQuickAccessTools[0]?.path ??
      "";
    syncManagerPinnedTools();
    replacementDialogVisible.value = true;
    return;
  }

  showPinResult(result);
}

function handleUnpinTool(toolPath: string): void {
  if (toolsStore.unpinQuickAccess(toolPath)) {
    customMessage.success("已从快捷栏移除");
  }
}

function handleToolPinAction(toolPath: string): void {
  if (isToolPinned(toolPath)) {
    handleUnpinTool(toolPath);
  } else {
    requestPinTool(toolPath);
  }
}

function handleToolContextCommand(command: string, toolPath: string): void {
  if (command === "toggle-pin") {
    handleToolPinAction(toolPath);
  } else if (command === "manage") {
    openQuickAccessManager();
  }
}

function handleQuickAccessCommand(command: string, toolPath: string): void {
  if (command === "unpin") {
    handleUnpinTool(toolPath);
  } else if (command === "manage") {
    openQuickAccessManager();
  }
}

function handleManagerToolSelected(toolPath: string): void {
  managerSelectedPath.value = "";
  requestPinTool(toolPath);
}

async function handleRestoreDefaultPinnedTools(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      "这会替换当前快捷栏中的所有工具，是否恢复推荐工具？",
      "恢复推荐工具",
      {
        confirmButtonText: "恢复",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    toolsStore.restoreDefaultPinnedQuickAccess();
    customMessage.success("已恢复推荐工具");
  } catch {
    // 用户取消确认时无需反馈。
  }
}

function confirmQuickAccessReplacement(): void {
  if (!replacementCandidate.value || !replacementPath.value) return;

  const result = toolsStore.replacePinnedQuickAccess(
    replacementPath.value,
    replacementCandidate.value.path
  );
  if (result === "success") {
    customMessage.success(
      `已将 ${replacementCandidate.value.name} 固定到快捷栏`
    );
    replacementDialogVisible.value = false;
    replacementCandidate.value = null;
    replacementPath.value = "";
  } else if (result === "already-pinned") {
    customMessage.info("该工具已固定到快捷栏");
  } else {
    customMessage.error("替换失败，请重试");
  }
}

const handleToolClick = async (toolPath: string) => {
  const toolId = getToolIdFromPath(toolPath);
  if (detachedManager.isDetached(toolId)) {
    await detachedManager.focusWindow(toolId);
    return;
  }

  toolsStore.addRecentTool(toolPath);
  toolsStore.openTool(toolPath);
};

const handleDropdownCommand = async (command: string, toolPath: string) => {
  if (command !== "cancel") return;

  const toolId = getToolIdFromPath(toolPath);
  try {
    const success = await detachedManager.closeWindow(toolId);
    if (success) {
      customMessage.success("已取消分离");
    } else {
      customMessage.error("取消分离失败");
    }
  } catch (error) {
    errorHandler.error(error, "取消分离时出错");
  }
};

watch(visiblePinnedTools, syncQuickAccessTools, { immediate: true });
watch(
  [quickManageVisible, () => toolsStore.pinnedQuickAccessTools],
  ([visible]) => {
    if (visible) syncManagerPinnedTools();
  },
  { immediate: true }
);

onMounted(async () => {
  await detachedManager.initialize();
});
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  text-align: center;
  box-sizing: border-box;
  overflow: hidden; /* 防止整体滚动 */
}

/* 固定头部区域 */
.header-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 20px 15px 20px;
  box-sizing: border-box;
  width: 100%;
}

/* 可滚动内容区域 — 滚动轴在此层，子容器不再需要 overflow 裁切 */
.content-section {
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable; /* 保持滚动条占位稳定，防止切换和搜索时抖动 */
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 20px 0;
  box-sizing: border-box;
  width: 100%;
}

/* 快速入口槽区域 */
.quick-access-section {
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 1200px;
  margin-bottom: 15px;
}

.quick-access-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  align-items: flex-start;
}

/* 快捷方式矩形卡片 */
.quick-access-draggable {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
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

/* 覆盖页面通用大图标的底部间距，保持管理齿轮与快捷工具图标垂直对齐。 */
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

.quick-manage-drag-handle {
  margin: 0;
  color: var(--text-color-light);
  cursor: grab;
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

.quick-replacement-description {
  margin: 0 0 14px;
  color: var(--text-color-light);
  line-height: 1.5;
}

.quick-replacement-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.quick-replacement-option {
  display: flex;
  align-items: center;
  margin-right: 0;
  padding: 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.quick-replacement-option-icon {
  margin-right: 6px;
}

/* 门户新布局 — 自然高度流，不设 height/overflow，让 content-section 统一滚动 */
.portal-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  max-width: 1200px;
  gap: 20px;
  align-items: flex-start;
  /* 顶部 4px 给卡片 hover 阴影留空间，左右 20px 对齐头部搜索框 */
  padding: 4px 20px 0;
  box-sizing: border-box;
}

/* 垂直分类侧边栏 — sticky 跟随页面滚动，自身超长时内部再滚 */
.category-sidebar {
  width: 140px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
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
  border-radius: 6px;
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
  border-left: 3px solid var(--primary-color);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
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

/* 工具网格容器 — 不再承担滚动，overflow 完全透明，阴影自由溢出 */
.tool-grid-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 4px 4px 0 4px;
  box-sizing: border-box;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  padding: 0 0 20px 0;
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
  /* 顶部对齐，保证图标和名字位置一致 */
  text-decoration: none;
  /* 移除 router-link 下划线 */
  color: var(--text-color);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  /* 轻微阴影 */
  cursor: pointer;
}

.tool-card:hover {
  transform: translateY(-5px);
  /* 悬停上浮效果 */
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
  /* 图标颜色 */
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
  /* 固定高度为3行，超出部分省略 */
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: calc(1.5em * 3); /* 确保至少占据3行高度 */
}

/* 搜索栏 */
.search-bar {
  width: 100%;
  max-width: 1200px;
  margin-bottom: 10px;
  padding: 0 10px;
  box-sizing: border-box;
}

.search-input {
  width: 100%;
  max-width: 600px;
  padding: 0.6rem 1rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  font-size: 0.95rem;
  box-sizing: border-box;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
}

/* 空状态 */
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

/* 已分离工具的样式 */
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

/* 统一的图标容器样式 - 大尺寸 */
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
