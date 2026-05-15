<template>
  <div class="dir-search">
    <!-- 顶部目录栏 -->
    <div class="dir-search__topbar">
      <el-tooltip :content="isPanelCollapsed ? '展开搜索面板' : '收起搜索面板'" :show-after="500">
        <button
          class="dir-search__collapse-btn"
          :class="{ collapsed: isPanelCollapsed }"
          @click="isPanelCollapsed = !isPanelCollapsed"
        >
          <PanelLeftClose v-if="!isPanelCollapsed" :size="16" />
          <PanelLeftOpen v-else :size="16" />
        </button>
      </el-tooltip>
      <DirectoryBar v-model="search.rootPath.value" class="dir-search__directory-bar" @search="search.executeSearch" />
    </div>

    <!-- 主体分栏 -->
    <div class="dir-search__body">
      <!-- 左栏：搜索面板 -->
      <div v-show="!isPanelCollapsed" class="dir-search__left" :style="{ width: panelWidth + 'px' }">
        <SearchPanel
          v-model:pattern="search.pattern.value"
          v-model:replacement="search.replacement.value"
          v-model:is-regex="search.isRegex.value"
          v-model:case-sensitive="search.caseSensitive.value"
          v-model:whole-word="search.wholeWord.value"
          v-model:include-globs="search.includeGlobs.value"
          v-model:exclude-globs="search.excludeGlobs.value"
          v-model:use-gitignore="search.useGitignore.value"
          v-model:show-replace="search.showReplace.value"
          v-model:view-mode="viewMode"
          :results="search.resultsList.value"
          :expanded-files="search.expandedFiles.value"
          :is-searching="search.isSearching.value"
          :summary="search.summary.value"
          :progress="search.progress.value"
          :selected-file-path="search.selectedFilePath.value"
          @search="search.executeSearch"
          @replace-all="handleReplaceAll"
          @refresh="search.executeSearch"
          @toggle-file="search.toggleFileExpand"
          @expand-all="search.expandAll"
          @collapse-all="search.collapseAll"
          @clear-results="search.clearResults"
          @cancel="search.cancelSearch"
          @select-match="handleSelectMatch"
        />
      </div>

      <!-- 拖拽分隔条 -->
      <div v-show="!isPanelCollapsed" class="dir-search__resize-handle" @mousedown="startResize" />

      <!-- 右栏：文件预览 -->
      <div class="dir-search__right">
        <FilePreview
          :file-path="search.selectedFilePath.value"
          :relative-path="selectedRelativePath"
          :matches="selectedFileMatches"
          :target-line="targetLine"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from "vue";
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import DirectoryBar from "./components/DirectoryBar.vue";
import SearchPanel from "./components/SearchPanel.vue";
import FilePreview from "./components/FilePreview.vue";
import { useDirSearch } from "./composables/useDirSearch";
import { useDirSearchUiState } from "./composables/useDirSearchUiState";
import { customMessage } from "@/utils/customMessage";
import type { SearchMatch } from "./types";

const search = useDirSearch();
const uiState = useDirSearchUiState();

// UI 状态（从持久化 composable 获取）
const panelWidth = uiState.panelWidth;
const isPanelCollapsed = uiState.isPanelCollapsed;
const viewMode = uiState.viewMode;
const targetLine = ref<number | null>(null);

// 恢复上次的搜索目录
if (uiState.lastRootPath.value && !search.rootPath.value) {
  search.rootPath.value = uiState.lastRootPath.value;
}

// 同步目录变更到持久化状态
watch(
  () => search.rootPath.value,
  (newPath) => {
    if (newPath) {
      uiState.lastRootPath.value = newPath;
    }
  },
);

// 计算属性
const selectedRelativePath = computed(() => {
  if (!search.selectedFilePath.value) return undefined;
  const result = search.results.value.get(search.selectedFilePath.value);
  return result?.relativePath;
});

const selectedFileMatches = computed(() => {
  if (!search.selectedFilePath.value) return undefined;
  const result = search.results.value.get(search.selectedFilePath.value);
  return result?.matches;
});

// 事件处理
function handleSelectMatch(filePath: string, match: SearchMatch) {
  search.selectFile(filePath);
  targetLine.value = match.lineNumber;
}

async function handleReplaceAll() {
  const totalFiles = search.totalFiles.value;
  const totalMatches = search.totalMatches.value;

  try {
    await ElMessageBox.confirm(
      `即将替换 ${totalFiles} 个文件中的 ${totalMatches} 处匹配。此操作不可撤销。`,
      "确认替换",
      {
        confirmButtonText: "执行替换",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      },
    );

    const result = await search.executeReplace();
    if (result) {
      customMessage.success(`替换完成：${result.filesReplaced} 文件，${result.totalReplacements} 处`);
      if (result.filesFailed > 0) {
        customMessage.warning(`${result.filesFailed} 个文件替换失败`);
      }
      // 替换后重新搜索
      await search.executeSearch();
    }
  } catch {
    // 用户取消
  }
}

// 拖拽调整宽度
let isResizing = false;
let startX = 0;
let startWidth = 0;

function startResize(e: MouseEvent) {
  isResizing = true;
  startX = e.clientX;
  startWidth = panelWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onResize);
  document.addEventListener("mouseup", stopResize);
}

function onResize(e: MouseEvent) {
  if (!isResizing) return;
  const delta = e.clientX - startX;
  panelWidth.value = Math.max(280, Math.min(600, startWidth + delta));
}

function stopResize() {
  isResizing = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.removeEventListener("mousemove", onResize);
  document.removeEventListener("mouseup", stopResize);
}

onUnmounted(() => {
  search.dispose();
  document.removeEventListener("mousemove", onResize);
  document.removeEventListener("mouseup", stopResize);
});
</script>

<style scoped>
.dir-search {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.dir-search__topbar {
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid var(--border-color);
}

.dir-search__directory-bar {
  flex: 1;
  border-bottom: none !important;
}

.dir-search__body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.dir-search__left {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-color);
}

.dir-search__resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background-color 0.15s;
  position: relative;
  z-index: 10;
  margin-left: -2px;
  margin-right: -2px;
}

.dir-search__resize-handle:hover,
.dir-search__resize-handle:active {
  background-color: var(--el-color-primary);
}

.dir-search__collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 4px 4px 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.dir-search__collapse-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.dir-search__collapse-btn.collapsed {
  color: var(--el-color-primary);
}

.dir-search__right {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
