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
    <HomeOptions v-model="showQuickAccess" />

    <div class="header-section" :class="{ 'has-doodle': showHomeDoodle }">
      <HomeQuickAccess
        v-if="showQuickAccess"
        v-model:quick-access-tools="quickAccessDragTools"
        v-model:manager-pinned-tools="managerPinnedTools"
        v-model:manager-visible="quickManageVisible"
        :available-tools-to-pin-groups="availableToolsToPinGroups"
        :max-items="QUICK_ACCESS_MAX_ITEMS"
        :get-tool-id-from-path="getToolIdFromPath"
        :is-detached="detachedManager.isDetached"
        :is-tool-visible="isToolVisible"
        @quick-access-drag-end="handleQuickAccessDragEnd"
        @manager-pinned-drag-end="handleManagerPinnedDragEnd"
        @tool-click="handleToolClick"
        @pin="requestPinTool"
        @unpin="handleUnpinTool"
        @restore="handleRestoreDefaultPinnedTools"
      />

      <HomeDoodle v-if="showHomeDoodle" />

      <HomeToolSearch v-model="searchText" />
    </div>

    <HomeToolCatalog
      :tools="visibleTools"
      :all-tools="toolsStore.orderedTools"
      :search-text="searchText"
      :get-tool-id-from-path="getToolIdFromPath"
      :get-pin-action-label="getPinActionLabel"
      :is-detached="detachedManager.isDetached"
      :is-tool-pinned="isToolPinned"
      @tool-click="handleToolClick"
      @toggle-pin="handleToolPinAction"
      @open-manager="openQuickAccessManager"
      @detached-command="handleDropdownCommand"
      @go-settings="router.push('/settings')"
    />

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
import { useRouter } from "vue-router";
import type { ToolConfig } from "@/services/types";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { QUICK_ACCESS_MAX_ITEMS, useToolsStore } from "@/stores/tools";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import HomeOptions from "./Home/HomeOptions.vue";
import HomeQuickAccess from "./Home/HomeQuickAccess.vue";
import HomeToolCatalog from "./Home/HomeToolCatalog.vue";
import HomeToolSearch from "./Home/HomeToolSearch.vue";
import HomeDoodle from "./Home/HomeDoodle.vue";

const router = useRouter();
const toolsStore = useToolsStore();
const appSettingsStore = useAppSettingsStore();
const detachedManager = useDetachedManager();
const errorHandler = createModuleErrorHandler("HomePage");

const searchText = ref("");
const quickManageVisible = ref(false);
const quickAccessDragTools = ref<ToolConfig[]>([]);
const managerPinnedTools = ref<ToolConfig[]>([]);
const replacementDialogVisible = ref(false);
const replacementCandidate = ref<ToolConfig | null>(null);
const replacementPath = ref("");

const getToolIdFromPath = (path: string): string =>
  path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const settings = computed(() => appSettingsStore.settings);
const showQuickAccess = computed({
  get: () => settings.value.showQuickAccess !== false,
  set: (visible: boolean) => {
    appSettingsStore.update({ showQuickAccess: visible });
  },
});
const showHomeDoodle = computed(() => settings.value.showHomeDoodle !== false);
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
const availableToolsToPinGroups = computed(() => {
  const groups = new Map<string, ToolConfig[]>();

  availableToolsToPin.value.forEach((tool) => {
    const primaryCategory = Array.isArray(tool.category)
      ? tool.category[0]
      : tool.category;
    const groupName = primaryCategory || "其他";
    const tools = groups.get(groupName);

    if (tools) {
      tools.push(tool);
    } else {
      groups.set(groupName, [tool]);
    }
  });

  return [...groups].map(([label, tools]) => ({ label, tools }));
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

async function handleToolClick(toolPath: string): Promise<void> {
  const toolId = getToolIdFromPath(toolPath);
  if (detachedManager.isDetached(toolId)) {
    await detachedManager.focusWindow(toolId);
    return;
  }

  toolsStore.addRecentTool(toolPath);
  toolsStore.openTool(toolPath);
}

async function handleDropdownCommand(
  command: string,
  toolPath: string
): Promise<void> {
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
}

watch(visiblePinnedTools, syncQuickAccessTools, { immediate: true });
watch(showQuickAccess, (visible) => {
  if (!visible) quickManageVisible.value = false;
});
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
  overflow: hidden;
}

.header-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 20px 15px;
  box-sizing: border-box;
  width: 100%;
  transition: padding 0.3s ease;
}

.header-section.has-doodle {
  padding-top: 45px;
  padding-bottom: 25px;
}

.content-section {
  flex: 1;
  overflow: hidden;
  /* 改为 hidden，防止整体滚动 */
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
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
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.quick-replacement-option-icon :deep(svg),
.quick-replacement-option-icon :deep(img) {
  width: 1em;
  height: 1em;
}
</style>
