<template>
  <div class="results-tree">
    <!-- 状态栏 -->
    <div v-if="summary || isSearching" class="results-tree__status">
      <template v-if="isSearching">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>
          搜索中... {{ progress?.filesScanned ?? 0 }} 文件已扫描
          <template v-if="progress && progress.totalMatches > 0">
            · {{ progress.totalMatches }} 个结果 ·
            {{ progress.filesMatched }} 文件
          </template>
        </span>
        <button class="results-tree__cancel-btn" @click="$emit('cancel')">
          取消
        </button>
      </template>
      <template v-else-if="summary">
        <span class="results-tree__summary">
          {{ summary.totalMatches }} 个结果 · {{ summary.filesMatched }} 文件 ·
          {{ summary.durationMs.toFixed(0) }}ms
        </span>
        <span v-if="summary.cancelled" class="results-tree__cancelled"
          >(已取消)</span
        >
      </template>
    </div>

    <!-- 结果区域 -->
    <div class="results-tree__list">
      <template v-if="results.length === 0 && !isSearching && summary">
        <div class="results-tree__empty">
          <SearchX :size="32" />
          <span>未找到匹配结果</span>
        </div>
      </template>

      <!-- 树形目录视图 -->
      <DirectoryTreeView
        v-if="viewMode === 'tree' && results.length > 0"
        ref="treeViewRef"
        :results="results"
        :expanded-files="expandedFiles"
        :selected-file-path="selectedFilePath"
        :show-replace="showReplace"
        @toggle-file="$emit('toggleFile', $event)"
        @select-match="(fp, m) => $emit('selectMatch', fp, m)"
        @dismiss-file="(fp) => $emit('dismissFile', fp)"
        @dismiss-match="(fp, idx) => $emit('dismissMatch', fp, idx)"
        @replace-file="(fp) => $emit('replaceFile', fp)"
        @replace-match="(fp, idx) => $emit('replaceMatch', fp, idx)"
        @context-menu="(ev, items, ctx) => $emit('contextMenu', ev, items, ctx)"
      />

      <!-- 列表视图 -->
      <template v-else-if="viewMode === 'list'">
        <div
          v-for="fileResult in results"
          :key="fileResult.filePath"
          class="results-tree__file"
        >
          <!-- 文件头 -->
          <div
            class="results-tree__file-header"
            @click="$emit('toggleFile', fileResult.filePath)"
            @contextmenu="onFileContextMenu($event, fileResult)"
          >
            <ChevronRight
              :size="14"
              class="results-tree__chevron"
              :class="{ expanded: expandedFiles.has(fileResult.filePath) }"
            />
            <FileIcon :size="14" class="results-tree__file-icon" />
            <span
              class="results-tree__file-name"
              :title="fileResult.relativePath"
            >
              {{ getFileName(fileResult.relativePath) }}
            </span>
            <span class="results-tree__file-dir">
              {{ getFileDir(fileResult.relativePath) }}
            </span>
            <span class="results-tree__match-count">{{
              fileResult.matches.length
            }}</span>
            <!-- 文件级悬停操作图标 -->
            <span class="results-tree__file-actions">
              <el-tooltip
                v-if="showReplace"
                content="替换该文件所有匹配"
                placement="top"
                :show-after="500"
              >
                <Replace
                  :size="16"
                  class="results-tree__file-action-icon"
                  @click.stop="$emit('replaceFile', fileResult.filePath)"
                />
              </el-tooltip>
              <el-tooltip
                content="从结果中移除该文件"
                placement="top"
                :show-after="500"
              >
                <X
                  :size="16"
                  class="results-tree__file-action-icon results-tree__file-action-icon--dismiss"
                  @click.stop="$emit('dismissFile', fileResult.filePath)"
                />
              </el-tooltip>
            </span>
          </div>

          <!-- 匹配项列表 -->
          <div
            v-if="expandedFiles.has(fileResult.filePath)"
            class="results-tree__matches"
          >
            <!-- 上下文块模式 -->
            <ContextBlockView
              v-if="contextEnabled && hasContextData(fileResult)"
              :blocks="getContextBlocks(fileResult)"
              @select-match="
                (lineNum) => onContextMatchSelect(fileResult, lineNum)
              "
              @contextmenu="
                (ev, lineNum) =>
                  onContextMatchContextMenu(ev, fileResult, lineNum)
              "
            />
            <!-- 普通单行模式 -->
            <template v-else>
              <ResultItem
                v-for="(match, idx) in fileResult.matches"
                :key="`${fileResult.filePath}-${idx}`"
                :match="match"
                :show-replace="showReplace"
                :is-selected="
                  selectedFilePath === fileResult.filePath &&
                  selectedLine === match.lineNumber
                "
                @select="onMatchSelect(fileResult.filePath, match)"
                @dismiss="$emit('dismissMatch', fileResult.filePath, idx)"
                @replace-match="$emit('replaceMatch', fileResult.filePath, idx)"
                @contextmenu="onMatchContextMenu($event, fileResult, idx)"
              />
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronRight, SearchX, X, Replace } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { FileIcon } from "lucide-vue-next";
import ResultItem from "./ResultItem.vue";
import ContextBlockView from "./ContextBlockView.vue";
import DirectoryTreeView from "./DirectoryTreeView.vue";
import type {
  FileSearchResult,
  SearchMatch,
  SearchProgress,
  SearchSummary,
  ViewMode,
  ContextBlock,
} from "../types";
import type { ContextMenuItem } from "../composables/useContextMenu";
import { buildContextBlocks } from "../composables/useContextBlocks";
import { useDirSearchUiState } from "../composables/useDirSearchUiState";

const props = defineProps<{
  results: FileSearchResult[];
  expandedFiles: Set<string>;
  isSearching: boolean;
  summary: SearchSummary | null;
  progress: SearchProgress | null;
  selectedFilePath: string | null;
  showReplace?: boolean;
  viewMode: ViewMode;
}>();

const uiState = useDirSearchUiState();
const contextEnabled = computed(() => uiState.contextLinesEnabled.value);
const contextLinesCount = computed(() => uiState.contextLinesCount.value);

const treeViewRef = ref<InstanceType<typeof DirectoryTreeView> | null>(null);

const emit = defineEmits<{
  toggleFile: [filePath: string];
  expandAll: [];
  collapseAll: [];
  cancel: [];
  selectMatch: [filePath: string, match: SearchMatch];
  dismissFile: [filePath: string];
  dismissMatch: [filePath: string, matchIndex: number];
  replaceFile: [filePath: string];
  replaceMatch: [filePath: string, matchIndex: number];
  contextMenu: [
    event: MouseEvent,
    items: ContextMenuItem[],
    context: Record<string, unknown>,
  ];
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

function getFileExtension(relativePath: string): string {
  const fileName = getFileName(relativePath);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex) : "";
}

/** 检查文件结果是否包含上下文数据 */
function hasContextData(fileResult: FileSearchResult): boolean {
  return fileResult.matches.some((m) => m.contextBefore || m.contextAfter);
}

/** 获取文件的上下文块（带缓存） */
const contextBlocksCache = new WeakMap<FileSearchResult, ContextBlock[]>();
function getContextBlocks(fileResult: FileSearchResult): ContextBlock[] {
  let cached = contextBlocksCache.get(fileResult);
  if (!cached) {
    cached = buildContextBlocks(fileResult.matches, contextLinesCount.value);
    contextBlocksCache.set(fileResult, cached);
  }
  return cached;
}

function onMatchSelect(filePath: string, match: SearchMatch) {
  selectedLine.value = match.lineNumber;
  emit("selectMatch", filePath, match);
}

/** 上下文块中点击匹配行 */
function onContextMatchSelect(
  fileResult: FileSearchResult,
  lineNumber: number
) {
  const match = fileResult.matches.find((m) => m.lineNumber === lineNumber);
  if (match) {
    selectedLine.value = lineNumber;
    emit("selectMatch", fileResult.filePath, match);
  }
}

/** 上下文块中右键匹配行 */
function onContextMatchContextMenu(
  event: MouseEvent,
  fileResult: FileSearchResult,
  lineNumber: number
) {
  const matchIndex = fileResult.matches.findIndex(
    (m) => m.lineNumber === lineNumber
  );
  if (matchIndex >= 0) {
    onMatchContextMenu(event, fileResult, matchIndex);
  }
}

/** 文件级右键菜单 */
function onFileContextMenu(event: MouseEvent, fileResult: FileSearchResult) {
  const ext = getFileExtension(fileResult.relativePath);
  const items: ContextMenuItem[] = [
    ...(props.showReplace ? [{ id: "replace-all", label: "全部替换" }] : []),
    { id: "dismiss-file", label: "消除" },
    { id: "sep-1", label: "", separator: true },
    ...(ext
      ? [
          { id: "exclude-type", label: `从搜索中排除 *${ext}` },
          { id: "include-type", label: `在搜索中仅包含 *${ext}` },
          { id: "sep-2", label: "", separator: true },
        ]
      : []),
    { id: "copy-name", label: "复制文件名" },
    { id: "copy-path", label: "复制路径" },
    { id: "copy-all-matches", label: "复制当前文件所有匹配" },
    { id: "copy-all-results", label: "复制所有搜索结果" },
    { id: "sep-3", label: "", separator: true },
    { id: "reveal-in-explorer", label: "在资源管理器中显示" },
  ];

  emit("contextMenu", event, items, {
    type: "file",
    filePath: fileResult.filePath,
    relativePath: fileResult.relativePath,
    extension: ext,
  });
}

/** 匹配项级右键菜单 */
function onMatchContextMenu(
  event: MouseEvent,
  fileResult: FileSearchResult,
  matchIndex: number
) {
  event.preventDefault();
  event.stopPropagation();

  const match = fileResult.matches[matchIndex];
  const items: ContextMenuItem[] = [
    ...(props.showReplace ? [{ id: "replace-match", label: "替换" }] : []),
    { id: "dismiss-match", label: "消除" },
    { id: "sep-1", label: "", separator: true },
    { id: "copy-line", label: "复制匹配行" },
    { id: "copy-all-matches", label: "复制当前文件所有匹配" },
    { id: "copy-all-results", label: "复制所有搜索结果" },
  ];

  emit("contextMenu", event, items, {
    type: "match",
    filePath: fileResult.filePath,
    relativePath: fileResult.relativePath,
    matchIndex,
    lineContent: match.lineContent,
    lineNumber: match.lineNumber,
    matchStart: match.matchStart,
  });
}

/** 展开所有（含树形视图的目录节点） */
function expandAllTree() {
  treeViewRef.value?.expandAllDirs();
}

/** 折叠所有（含树形视图的目录节点） */
function collapseAllTree() {
  treeViewRef.value?.collapseAllDirs();
}

/** 展开指定的目录路径列表 */
function expandDirs(paths: string[]) {
  treeViewRef.value?.expandDirs(paths);
}

defineExpose({ expandAllTree, collapseAllTree, expandDirs });
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
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
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
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}

/* 文件级悬停操作图标 */
.results-tree__file-actions {
  display: none;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 4px;
  line-height: 1;
}

.results-tree__file-header:hover .results-tree__file-actions {
  display: flex;
}

.results-tree__file-action-icon {
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
}

.results-tree__file-action-icon:hover {
  color: var(--el-color-primary);
}

.results-tree__file-action-icon--dismiss:hover {
  color: var(--el-color-danger);
}

.results-tree__matches {
  padding: 2px 0;
}
</style>
