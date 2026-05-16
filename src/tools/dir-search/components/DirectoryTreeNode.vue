<template>
  <div class="tree-node">
    <!-- 目录节点头部 -->
    <div class="tree-node__dir-header" @click="$emit('toggleDir', node.path)" @contextmenu="onDirContextMenu($event)">
      <ChevronRight :size="14" class="tree-node__chevron" :class="{ expanded: isExpanded }" />
      <Folder :size="14" class="tree-node__folder-icon" />
      <span class="tree-node__dir-name">{{ node.name }}</span>
      <span class="tree-node__match-count">{{ node.totalMatches }}</span>
      <!-- 目录级悬停操作按钮 -->
      <span class="tree-node__dir-actions">
        <button
          class="tree-node__action-btn tree-node__action-btn--dismiss"
          title="从结果中移除该目录"
          @click.stop="dismissDir"
        >
          <X :size="14" />
        </button>
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
        :expanded-files="expandedFiles"
        :selected-file-path="selectedFilePath"
        :show-replace="showReplace"
        @toggle-dir="(p: string) => $emit('toggleDir', p)"
        @toggle-file="(p: string) => $emit('toggleFile', p)"
        @select-match="(fp: string, m: SearchMatch) => $emit('selectMatch', fp, m)"
        @dismiss-file="(fp: string) => $emit('dismissFile', fp)"
        @dismiss-match="(fp: string, idx: number) => $emit('dismissMatch', fp, idx)"
        @replace-file="(fp: string) => $emit('replaceFile', fp)"
        @replace-match="(fp: string, idx: number) => $emit('replaceMatch', fp, idx)"
        @context-menu="
          (ev: MouseEvent, items: ContextMenuItem[], ctx: Record<string, unknown>) =>
            $emit('contextMenu', ev, items, ctx)
        "
      />

      <!-- 文件节点 -->
      <div v-for="fileResult in node.files" :key="fileResult.filePath" class="tree-node__file">
        <!-- 文件头 -->
        <div
          class="tree-node__file-header"
          @click="$emit('toggleFile', fileResult.filePath)"
          @contextmenu="onFileContextMenu($event, fileResult)"
        >
          <ChevronRight
            :size="14"
            class="tree-node__chevron"
            :class="{ expanded: expandedFiles.has(fileResult.filePath) }"
          />
          <FileIcon :size="14" class="tree-node__file-icon" />
          <span class="tree-node__file-name">{{ getFileName(fileResult.relativePath) }}</span>
          <span class="tree-node__match-count">{{ fileResult.matches.length }}</span>
          <!-- 文件级悬停操作按钮 -->
          <span class="tree-node__file-actions">
            <button
              v-if="showReplace"
              class="tree-node__action-btn"
              title="替换该文件所有匹配"
              @click.stop="$emit('replaceFile', fileResult.filePath)"
            >
              <Replace :size="14" />
            </button>
            <button
              class="tree-node__action-btn tree-node__action-btn--dismiss"
              title="从结果中移除该文件"
              @click.stop="$emit('dismissFile', fileResult.filePath)"
            >
              <X :size="14" />
            </button>
          </span>
        </div>

        <!-- 匹配项列表 -->
        <div v-if="expandedFiles.has(fileResult.filePath)" class="tree-node__matches">
          <ResultItem
            v-for="(match, idx) in fileResult.matches"
            :key="`${fileResult.filePath}-${idx}`"
            :match="match"
            :show-replace="showReplace"
            :is-selected="selectedFilePath === fileResult.filePath"
            @select="onMatchSelect(fileResult.filePath, match)"
            @dismiss="$emit('dismissMatch', fileResult.filePath, idx)"
            @replace-match="$emit('replaceMatch', fileResult.filePath, idx)"
            @contextmenu="onMatchContextMenu($event, fileResult, idx)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight, Folder, X, Replace } from "lucide-vue-next";
import { FileIcon } from "lucide-vue-next";
import ResultItem from "./ResultItem.vue";
import type { DirectoryNode, FileSearchResult, SearchMatch } from "../types";
import type { ContextMenuItem } from "../composables/useContextMenu";

const props = defineProps<{
  node: DirectoryNode;
  expandedDirs: Set<string>;
  expandedFiles: Set<string>;
  selectedFilePath: string | null;
  showReplace?: boolean;
}>();

const emit = defineEmits<{
  toggleDir: [dirPath: string];
  toggleFile: [filePath: string];
  selectMatch: [filePath: string, match: SearchMatch];
  dismissFile: [filePath: string];
  dismissMatch: [filePath: string, matchIndex: number];
  replaceFile: [filePath: string];
  replaceMatch: [filePath: string, matchIndex: number];
  contextMenu: [event: MouseEvent, items: ContextMenuItem[], context: Record<string, unknown>];
}>();

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
  emit("selectMatch", filePath, match);
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
    emit("dismissFile", fp);
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
    { id: "copy-all-dir-matches", label: "全部复制" },
  ];

  emit("contextMenu", event, items, {
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
    { id: "copy-all-matches", label: "复制所有匹配行" },
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
function onMatchContextMenu(event: MouseEvent, fileResult: FileSearchResult, matchIndex: number) {
  event.preventDefault();
  event.stopPropagation();

  const match = fileResult.matches[matchIndex];
  const items: ContextMenuItem[] = [
    ...(props.showReplace ? [{ id: "replace-match", label: "替换" }] : []),
    { id: "dismiss-match", label: "消除" },
    { id: "sep-1", label: "", separator: true },
    { id: "copy-line", label: "复制匹配行" },
    { id: "copy-all-matches", label: "复制所有匹配行" },
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
</script>

<style scoped>
/* .tree-node {
} */

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
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.06));
}

/* 目录级悬停操作按钮 */
.tree-node__dir-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-node__dir-header:hover .tree-node__dir-actions {
  opacity: 1;
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
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.12));
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
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.06));
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

/* 文件级悬停操作按钮 */
.tree-node__file-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-node__file-header:hover .tree-node__file-actions {
  opacity: 1;
}

.tree-node__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.tree-node__action-btn:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-primary);
}

.tree-node__action-btn--dismiss:hover {
  background-color: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-danger);
}

.tree-node__matches {
  padding: 2px 0;
}
</style>
