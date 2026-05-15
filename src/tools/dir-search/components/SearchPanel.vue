<template>
  <div class="search-panel">
    <!-- 顶部标题栏 -->
    <div class="search-panel__header">
      <span class="search-panel__title">搜索</span>
      <div class="search-panel__actions">
        <el-tooltip content="刷新搜索" :show-after="500">
          <button class="search-panel__action-btn" :disabled="!hasResults" @click="$emit('refresh')">
            <RefreshCw :size="16" />
          </button>
        </el-tooltip>
        <el-tooltip :content="allCollapsed ? '全部展开' : '全部折叠'" :show-after="500">
          <button class="search-panel__action-btn" :disabled="!hasResults" @click="toggleExpandCollapse">
            <ChevronsDown v-if="allCollapsed" :size="16" />
            <ChevronsUp v-else :size="16" />
          </button>
        </el-tooltip>
        <el-tooltip content="清除结果" :show-after="500">
          <button class="search-panel__action-btn" :disabled="!hasResults" @click="$emit('clearResults')">
            <X :size="16" />
          </button>
        </el-tooltip>
        <el-tooltip :content="viewMode === 'list' ? '切换为树形视图' : '切换为列表视图'" :show-after="500">
          <button class="search-panel__action-btn" @click="toggleViewMode">
            <FolderTree v-if="viewMode === 'list'" :size="16" />
            <List v-else :size="16" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- 搜索输入区 -->
    <SearchInput
      v-model:pattern="pattern"
      v-model:replacement="replacement"
      v-model:is-regex="isRegex"
      v-model:case-sensitive="caseSensitive"
      v-model:whole-word="wholeWord"
      v-model:include-globs="includeGlobs"
      v-model:exclude-globs="excludeGlobs"
      v-model:use-gitignore="useGitignore"
      v-model:show-replace="showReplace"
      @search="$emit('search')"
      @replace-all="$emit('replaceAll')"
    />

    <!-- 结果区 -->
    <ResultsTree
      :results="results"
      :expanded-files="expandedFiles"
      :is-searching="isSearching"
      :summary="summary"
      :progress="progress"
      :selected-file-path="selectedFilePath"
      @toggle-file="$emit('toggleFile', $event)"
      @expand-all="$emit('expandAll')"
      @collapse-all="$emit('collapseAll')"
      @cancel="$emit('cancel')"
      @select-match="(fp, m) => $emit('selectMatch', fp, m)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RefreshCw, ChevronsUp, ChevronsDown, X, FolderTree, List } from "lucide-vue-next";
import SearchInput from "./SearchInput.vue";
import ResultsTree from "./ResultsTree.vue";
import type { FileSearchResult, SearchMatch, SearchProgress, SearchSummary, ViewMode } from "../types";

const props = defineProps<{
  results: FileSearchResult[];
  expandedFiles: Set<string>;
  isSearching: boolean;
  summary: SearchSummary | null;
  progress: SearchProgress | null;
  selectedFilePath: string | null;
  viewMode: ViewMode;
}>();

const pattern = defineModel<string>("pattern", { required: true });
const replacement = defineModel<string>("replacement", { required: true });
const isRegex = defineModel<boolean>("isRegex", { required: true });
const caseSensitive = defineModel<boolean>("caseSensitive", { required: true });
const wholeWord = defineModel<boolean>("wholeWord", { required: true });
const includeGlobs = defineModel<string>("includeGlobs", { required: true });
const excludeGlobs = defineModel<string>("excludeGlobs", { required: true });
const useGitignore = defineModel<boolean>("useGitignore", { required: true });
const showReplace = defineModel<boolean>("showReplace", { required: true });
const viewMode = defineModel<ViewMode>("viewMode", { required: true });

const hasResults = computed(() => props.results.length > 0);
const allCollapsed = computed(() => hasResults.value && props.expandedFiles.size === 0);

function toggleViewMode() {
  viewMode.value = viewMode.value === "list" ? "tree" : "list";
}

const emit = defineEmits<{
  search: [];
  replaceAll: [];
  refresh: [];
  toggleFile: [filePath: string];
  expandAll: [];
  collapseAll: [];
  clearResults: [];
  cancel: [];
  selectMatch: [filePath: string, match: SearchMatch];
}>();

function toggleExpandCollapse() {
  if (allCollapsed.value) {
    emit("expandAll");
  } else {
    emit("collapseAll");
  }
}
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
  font-size: 11px;
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
  width: 26px;
  height: 26px;
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
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  border-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.2));
}

.search-panel__action-btn:disabled {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}
</style>
