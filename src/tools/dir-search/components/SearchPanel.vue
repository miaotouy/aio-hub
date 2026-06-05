<template>
  <div class="search-panel">
    <!-- 顶部标题栏 -->
    <div class="search-panel__header">
      <span class="search-panel__title">搜索</span>
      <div class="search-panel__actions">
        <el-tooltip content="刷新搜索" :show-after="500">
          <button
            class="search-panel__action-btn"
            :disabled="!hasResults"
            @click="search.executeSearch"
          >
            <RefreshCw :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip
          :content="allCollapsed ? '全部展开' : '全部折叠'"
          :show-after="500"
        >
          <button
            class="search-panel__action-btn"
            :disabled="!hasResults"
            @click="toggleExpandCollapse"
          >
            <ChevronsDown v-if="allCollapsed" :size="18" />
            <ChevronsUp v-else :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="清除搜索内容" :show-after="500">
          <button
            class="search-panel__action-btn"
            :disabled="!search.pattern.value"
            @click="search.pattern.value = ''"
          >
            <X :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip
          :content="
            uiState.viewMode.value === 'list'
              ? '切换为树形视图'
              : '切换为列表视图'
          "
          :show-after="500"
        >
          <button class="search-panel__action-btn" @click="toggleViewMode">
            <FolderTree v-if="uiState.viewMode.value === 'list'" :size="18" />
            <List v-else :size="18" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- 搜索输入区 -->
    <SearchInput />

    <!-- 结果区 -->
    <ResultsTree ref="resultsTreeRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  RefreshCw,
  ChevronsUp,
  ChevronsDown,
  X,
  FolderTree,
  List,
} from "lucide-vue-next";
import SearchInput from "./SearchInput.vue";
import ResultsTree from "./ResultsTree.vue";
import { useDirSearchContext } from "../composables/useDirSearchContext";
import { useDirSearchUiState } from "../composables/useDirSearchUiState";

const search = useDirSearchContext();
const uiState = useDirSearchUiState();
const resultsTreeRef = ref<InstanceType<typeof ResultsTree> | null>(null);

const hasResults = computed(() => search.resultsList.value.length > 0);
const allCollapsed = computed(
  () => hasResults.value && search.expandedFiles.value.size === 0
);

function toggleViewMode() {
  uiState.viewMode.value = uiState.viewMode.value === "list" ? "tree" : "list";
}

function toggleExpandCollapse() {
  if (allCollapsed.value) {
    search.expandAll();
    resultsTreeRef.value?.expandAllTree();
  } else {
    search.collapseAll();
    resultsTreeRef.value?.collapseAllTree();
  }
}

/** 展开指定的目录路径列表（供父组件调用） */
function expandDirs(paths: string[]) {
  resultsTreeRef.value?.expandDirs(paths);
}

defineExpose({ expandDirs });
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.search-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.search-panel__title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--el-text-color-secondary);
}

.search-panel__actions {
  display: flex;
  align-items: center;
  gap: 1px;
}

.search-panel__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.search-panel__action-btn:hover:not(:disabled) {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.2)
  );
}

.search-panel__action-btn:disabled {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}
</style>
