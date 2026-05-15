<template>
  <div class="results-tree">
    <!-- 状态栏 -->
    <div v-if="summary || isSearching" class="results-tree__status">
      <template v-if="isSearching">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span> 搜索中... {{ progress?.filesScanned ?? 0 }} 文件已扫描 </span>
        <button class="results-tree__cancel-btn" @click="$emit('cancel')">取消</button>
      </template>
      <template v-else-if="summary">
        <span class="results-tree__summary">
          {{ summary.totalMatches }} 个结果 · {{ summary.filesMatched }} 文件 · {{ summary.durationMs.toFixed(0) }}ms
        </span>
        <span v-if="summary.cancelled" class="results-tree__cancelled">(已取消)</span>
      </template>
    </div>

    <!-- 结果列表 -->
    <div class="results-tree__list">
      <template v-if="results.length === 0 && !isSearching && summary">
        <div class="results-tree__empty">
          <SearchX :size="32" />
          <span>未找到匹配结果</span>
        </div>
      </template>

      <div v-for="fileResult in results" :key="fileResult.filePath" class="results-tree__file">
        <!-- 文件头 -->
        <div class="results-tree__file-header" @click="$emit('toggleFile', fileResult.filePath)">
          <ChevronRight
            :size="14"
            class="results-tree__chevron"
            :class="{ expanded: expandedFiles.has(fileResult.filePath) }"
          />
          <FileIcon :size="14" class="results-tree__file-icon" />
          <span class="results-tree__file-name" :title="fileResult.relativePath">
            {{ getFileName(fileResult.relativePath) }}
          </span>
          <span class="results-tree__file-dir">
            {{ getFileDir(fileResult.relativePath) }}
          </span>
          <span class="results-tree__match-count">{{ fileResult.matches.length }}</span>
        </div>

        <!-- 匹配项列表 -->
        <div v-if="expandedFiles.has(fileResult.filePath)" class="results-tree__matches">
          <ResultItem
            v-for="(match, idx) in fileResult.matches"
            :key="`${fileResult.filePath}-${idx}`"
            :match="match"
            :is-selected="selectedFilePath === fileResult.filePath && selectedLine === match.lineNumber"
            @select="onMatchSelect(fileResult.filePath, match)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronRight, SearchX } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { FileIcon } from "lucide-vue-next";
import ResultItem from "./ResultItem.vue";
import type { FileSearchResult, SearchMatch, SearchProgress, SearchSummary } from "../types";

defineProps<{
  results: FileSearchResult[];
  expandedFiles: Set<string>;
  isSearching: boolean;
  summary: SearchSummary | null;
  progress: SearchProgress | null;
  selectedFilePath: string | null;
}>();

const emit = defineEmits<{
  toggleFile: [filePath: string];
  expandAll: [];
  collapseAll: [];
  cancel: [];
  selectMatch: [filePath: string, match: SearchMatch];
}>();

const selectedLine = ref<number | null>(null);

function getFileName(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] || relativePath;
}

function getFileDir(relativePath: string): string {
  const parts = relativePath.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function onMatchSelect(filePath: string, match: SearchMatch) {
  selectedLine.value = match.lineNumber;
  emit("selectMatch", filePath, match);
}
</script>

<style scoped>
.results-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.results-tree__status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.results-tree__cancel-btn {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid var(--el-color-danger);
  border-radius: 3px;
  background: transparent;
  color: var(--el-color-danger);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.results-tree__cancel-btn:hover {
  background-color: var(--el-color-danger);
  color: #fff;
}

.results-tree__summary {
  color: var(--el-text-color-regular);
}

.results-tree__cancelled {
  color: var(--el-color-warning);
}

.results-tree__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.results-tree__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.results-tree__file {
  margin-bottom: 2px;
}

.results-tree__file-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
  transition: background-color 0.1s;
  user-select: none;
}

.results-tree__file-header:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.06));
}

.results-tree__chevron {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  transition: transform 0.15s;
}

.results-tree__chevron.expanded {
  transform: rotate(90deg);
}

.results-tree__file-icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.results-tree__file-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.results-tree__file-dir {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.results-tree__match-count {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 8px;
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.12));
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}

.results-tree__matches {
  padding: 2px 0;
}
</style>
