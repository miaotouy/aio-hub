<template>
  <div class="tree-node">
    <!-- 目录节点头部 -->
    <div
      class="tree-node__dir-header"
      @click="treeActions.toggleDir(node.path)"
      @contextmenu="onDirContextMenu($event)"
    >
      <ChevronRight
        :size="14"
        class="tree-node__chevron"
        :class="{ expanded: isExpanded }"
      /><Folder :size="14" class="tree-node__folder-icon" />
      <span class="tree-node__dir-name">{{ node.name }}</span>
      <span class="tree-node__match-count">{{ node.totalMatches }}</span>
      <!-- 目录级悬停操作图标 -->
      <span class="tree-node__dir-actions">
        <el-tooltip
          content="从结果中移除该目录"
          placement="top"
          :show-after="500"
        >
          <X
            :size="16"
            class="tree-node__action-icon tree-node__action-icon--dismiss"
            @click.stop="dismissDir"
          />
        </el-tooltip>
      </span>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="tree-node__content">
      <!-- 子目录 -->
      <DirectoryTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :expanded-dirs="expandedDirs"
      />

      <!-- 文件节点 -->
      <div
        v-for="fileResult in node.files"
        :key="fileResult.filePath"
        class="tree-node__file"
      >
        <!-- 文件头 -->
        <div
          class="tree-node__file-header"
          @click="search.toggleFileExpand(fileResult.filePath)"
          @contextmenu="onFileContextMenu($event, fileResult)"
        >
          <ChevronRight
            :size="14"
            class="tree-node__chevron"
            :class="{
              expanded: search.expandedFiles.value.has(fileResult.filePath),
            }"
          />
          <FileIcon :size="14" class="tree-node__file-icon" />
          <span class="tree-node__file-name">{{
            getFileName(fileResult.relativePath)
          }}</span>
          <span class="tree-node__match-count">{{
            fileResult.matches.length
          }}</span>
          <!-- 文件级悬停操作图标 -->
          <span class="tree-node__file-actions">
            <el-tooltip
              v-if="search.showReplace.value"
              content="替换该文件所有匹配"
              placement="top"
              :show-after="500"
            >
              <Replace
                :size="16"
                class="tree-node__action-icon"
                @click.stop="actions.handleReplaceFile(fileResult.filePath)"
              />
            </el-tooltip>
            <el-tooltip
              content="从结果中移除该文件"
              placement="top"
              :show-after="500"
            >
              <X
                :size="16"
                class="tree-node__action-icon tree-node__action-icon--dismiss"
                @click.stop="search.dismissFile(fileResult.filePath)"
              />
            </el-tooltip>
          </span>
        </div>

        <!-- 匹配项列表 -->
        <div
          v-if="search.expandedFiles.value.has(fileResult.filePath)"
          class="tree-node__matches"
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
              :show-replace="search.showReplace.value"
              :is-selected="
                search.selectedFilePath.value === fileResult.filePath &&
                selectedLine === match.lineNumber
              "
              @select="onMatchSelect(fileResult.filePath, match)"
              @dismiss="search.dismissMatch(fileResult.filePath, idx)"
              @replace-match="
                actions.handleReplaceMatch(fileResult.filePath, idx)
              "
              @contextmenu="onMatchContextMenu($event, fileResult, idx)"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject } from "vue";
import { ChevronRight, Folder, X, Replace } from "lucide-vue-next";
import { FileIcon } from "lucide-vue-next";
import ResultItem from "./ResultItem.vue";
import ContextBlockView from "./ContextBlockView.vue";
import type {
  DirectoryNode,
  FileSearchResult,
  SearchMatch,
  ContextBlock,
} from "../types";
import type { ContextMenuItem } from "../composables/useContextMenu";
import { buildContextBlocks } from "../composables/useContextBlocks";
import { useDirSearchContext } from "../composables/useDirSearchContext";
import { useDirSearchUiState } from "../composables/useDirSearchUiState";

const props = defineProps<{
  node: DirectoryNode;
  expandedDirs: Set<string>;
}>();

const search = useDirSearchContext();
const uiState = useDirSearchUiState();

// 注入根组件的动作处理器
const actions = inject("dirSearchActions") as {
  handleSelectMatch: (filePath: string, match: SearchMatch) => void;
  handleReplaceFile: (filePath: string) => void;
  handleReplaceMatch: (filePath: string, matchIndex: number) => void;
  handleContextMenu: (
    event: MouseEvent,
    items: ContextMenuItem[],
    context: Record<string, unknown>
  ) => void;
};

// 注入树形视图的 toggleDir
const treeActions = inject("dirTreeActions") as {
  toggleDir: (dirPath: string) => void;
};

const contextEnabled = computed(() => uiState.contextLinesEnabled.value);
const contextLinesCount = computed(() => uiState.contextLinesCount.value);
const selectedLine = ref<number | null>(null);

const isExpanded = computed(() => {
  // 空路径（根级 "." 节点）默认展开
  if (props.node.path === "") return true;
  return props.expandedDirs.has(props.node.path);
});

function getFileName(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] || relativePath;
}

function getFileExtension(relativePath: string): string {
  const fileName = getFileName(relativePath);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex) : "";
}

function onMatchSelect(filePath: string, match: SearchMatch) {
  selectedLine.value = match.lineNumber;
  search.selectFile(filePath);
  actions.handleSelectMatch(filePath, match);
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

/** 上下文块中点击匹配行 */
function onContextMatchSelect(
  fileResult: FileSearchResult,
  lineNumber: number
) {
  const match = fileResult.matches.find((m) => m.lineNumber === lineNumber);
  if (match) {
    selectedLine.value = lineNumber;
    search.selectFile(fileResult.filePath);
    actions.handleSelectMatch(fileResult.filePath, match);
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

/** 收集目录下所有文件路径 */
function collectAllFilePaths(dirNode: DirectoryNode): string[] {
  const paths: string[] = [];
  for (const file of dirNode.files) {
    paths.push(file.filePath);
  }
  for (const child of dirNode.children) {
    paths.push(...collectAllFilePaths(child));
  }
  return paths;
}

/** 收集目录下所有子目录路径（含自身） */
function collectAllDirPaths(dirNode: DirectoryNode): string[] {
  const paths: string[] = [];
  if (dirNode.path) paths.push(dirNode.path);
  for (const child of dirNode.children) {
    paths.push(...collectAllDirPaths(child));
  }
  return paths;
}

/** 消除整个目录（移除该目录下所有文件） */
function dismissDir() {
  const filePaths = collectAllFilePaths(props.node);
  for (const fp of filePaths) {
    search.dismissFile(fp);
  }
}

/** 目录级右键菜单 */
function onDirContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const items: ContextMenuItem[] = [
    { id: "dismiss-dir", label: "消除" },
    { id: "restrict-to-dir", label: "将搜索限制为文件夹" },
    { id: "expand-recursive", label: "以递归方式展开" },
    { id: "exclude-dir", label: "从搜索中排除文件夹" },
    { id: "sep-1", label: "", separator: true },
    { id: "copy-dir-name", label: "复制" },
    { id: "copy-dir-path", label: "复制路径" },
    { id: "copy-all-dir-matches", label: "复制当前目录所有匹配" },
    { id: "copy-all-results", label: "复制所有搜索结果" },
  ];

  actions.handleContextMenu(event, items, {
    type: "directory",
    dirPath: props.node.path,
    dirName: props.node.name,
    filePaths: collectAllFilePaths(props.node),
    subDirPaths: collectAllDirPaths(props.node),
  });
}

/** 文件级右键菜单 */
function onFileContextMenu(event: MouseEvent, fileResult: FileSearchResult) {
  const ext = getFileExtension(fileResult.relativePath);
  const items: ContextMenuItem[] = [
    ...(search.showReplace.value
      ? [{ id: "replace-all", label: "全部替换" }]
      : []),
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

  actions.handleContextMenu(event, items, {
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
    ...(search.showReplace.value
      ? [{ id: "replace-match", label: "替换" }]
      : []),
    { id: "dismiss-match", label: "消除" },
    { id: "sep-1", label: "", separator: true },
    { id: "copy-line", label: "复制匹配行" },
    { id: "copy-all-matches", label: "复制当前文件所有匹配" },
    { id: "copy-all-results", label: "复制所有搜索结果" },
  ];

  actions.handleContextMenu(event, items, {
    type: "match",
    filePath: fileResult.filePath,
    relativePath: fileResult.relativePath,
    matchIndex,
    lineContent: match.lineContent,
    lineNumber: match.lineNumber,
    matchStart: match.matchStart,
  });
}
</script>

<style scoped>
.tree-node__dir-header {
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

.tree-node__dir-header:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
}

/* 目录级悬停操作图标 */
.tree-node__dir-actions {
  display: none;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 4px;
  line-height: 1;
}

.tree-node__dir-header:hover .tree-node__dir-actions {
  display: flex;
}

.tree-node__chevron {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  transition: transform 0.15s;
}

.tree-node__chevron.expanded {
  transform: rotate(90deg);
}

.tree-node__folder-icon {
  flex-shrink: 0;
  color: var(--el-color-warning);
}

.tree-node__dir-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.tree-node__match-count {
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

.tree-node__content {
  padding-left: 12px;
}

.tree-node__file {
  margin-bottom: 2px;
}

.tree-node__file-header {
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

.tree-node__file-header:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
}

.tree-node__file-icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.tree-node__file-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

/* 文件级悬停操作图标 */
.tree-node__file-actions {
  display: none;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 4px;
  line-height: 1;
}

.tree-node__file-header:hover .tree-node__file-actions {
  display: flex;
}

.tree-node__action-icon {
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
}

.tree-node__action-icon:hover {
  color: var(--el-color-primary);
}

.tree-node__action-icon--dismiss:hover {
  color: var(--el-color-danger);
}

.tree-node__matches {
  padding: 2px 0;
}
</style>
