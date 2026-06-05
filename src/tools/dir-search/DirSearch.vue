<template>
  <div class="dir-search">
    <!-- 顶部目录栏 -->
    <div class="dir-search__topbar">
      <el-tooltip
        :content="isPanelCollapsed ? '展开搜索面板' : '收起搜索面板'"
        :show-after="500"
      >
        <button
          class="dir-search__collapse-btn"
          :class="{ collapsed: isPanelCollapsed }"
          @click="isPanelCollapsed = !isPanelCollapsed"
        >
          <PanelLeftClose v-if="!isPanelCollapsed" :size="16" />
          <PanelLeftOpen v-else :size="16" />
        </button>
      </el-tooltip>
      <DirectoryBar
        v-model="search.rootPath.value"
        class="dir-search__directory-bar"
        @search="search.executeSearch"
      />
    </div>

    <!-- 主体分栏 -->
    <div class="dir-search__body">
      <!-- 左栏：搜索面板 -->
      <div
        v-show="!isPanelCollapsed"
        class="dir-search__left"
        :style="{ width: panelWidth + 'px' }"
      >
        <SearchPanel ref="searchPanelRef" />
      </div>

      <!-- 拖拽分隔条 -->
      <div
        v-show="!isPanelCollapsed"
        class="dir-search__resize-handle"
        @mousedown="startResize"
      />

      <!-- 右栏：文件预览 -->
      <div class="dir-search__right">
        <FilePreview
          :file-path="search.selectedFilePath.value"
          :relative-path="selectedRelativePath"
          :matches="selectedFileMatches"
          :target-match="targetMatch"
        />
      </div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      :state="contextMenu.state.value"
      @select="handleContextMenuSelect"
      @hide="contextMenu.hide"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, provide } from "vue";
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import DirectoryBar from "./components/DirectoryBar.vue";
import SearchPanel from "./components/SearchPanel.vue";
import FilePreview from "./components/FilePreview.vue";
import ContextMenu from "./components/ContextMenu.vue";
import { useDirSearch } from "./composables/useDirSearch";
import { useDirSearchUiState } from "./composables/useDirSearchUiState";
import {
  useContextMenu,
  type ContextMenuItem,
} from "./composables/useContextMenu";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { DIR_SEARCH_CONTEXT_KEY } from "./types";
import type { SearchMatch, TargetMatch } from "./types";

const errorHandler = createModuleErrorHandler("tools/dir-search/DirSearch");

const search = useDirSearch();
const uiState = useDirSearchUiState();
const contextMenu = useContextMenu();
const searchPanelRef = ref<InstanceType<typeof SearchPanel> | null>(null);

// 提供搜索上下文给所有子组件
provide(DIR_SEARCH_CONTEXT_KEY, search);

// UI 状态（从持久化 composable 获取）
const panelWidth = uiState.panelWidth;
const isPanelCollapsed = uiState.isPanelCollapsed;
const targetMatch = ref<TargetMatch | null>(null);
let matchSeq = 0;

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
function handleSelectMatch(_filePath: string, match: SearchMatch) {
  targetMatch.value = {
    lineNumber: match.lineNumber,
    matchStart: match.matchStart,
    matchEnd: match.matchEnd,
    _seq: ++matchSeq,
  };
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
      }
    );

    const result = await search.executeReplace();
    if (result) {
      customMessage.success(
        `替换完成：${result.filesReplaced} 文件，${result.totalReplacements} 处`
      );
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

/** 替换单个文件的所有匹配 */
async function handleReplaceFile(filePath: string) {
  const fileResult = search.results.value.get(filePath);
  if (!fileResult) return;

  const result = await search.executeReplace([filePath]);
  if (result) {
    customMessage.success(`替换完成：${result.totalReplacements} 处`);
    // 替换后从结果中移除该文件，重新搜索会自动更新
    search.dismissFile(filePath);
  }
}
/** 替换单个匹配项 */
async function handleReplaceMatch(filePath: string, matchIndex: number) {
  const result = await search.replaceSingleMatch(filePath, matchIndex);
  if (result?.success) {
    customMessage.success(
      `已替换: "${result.originalText}" → "${result.replacedText}"`
    );
  }
}

/** 处理右键菜单触发 */
function handleContextMenu(
  event: MouseEvent,
  items: ContextMenuItem[],
  context: Record<string, unknown>
) {
  contextMenu.show(event, items, context);
}

/** 处理右键菜单项选择 */
async function handleContextMenuSelect(
  itemId: string,
  context: Record<string, unknown>
) {
  const filePath = context.filePath as string;
  const relativePath = context.relativePath as string;

  switch (itemId) {
    // === 文件级操作 ===
    case "replace-all":
      if (filePath) handleReplaceFile(filePath);
      break;

    case "dismiss-file":
      if (filePath) search.dismissFile(filePath);
      break;

    case "exclude-type": {
      const ext = context.extension as string;
      if (ext) {
        const glob = `*${ext}`;
        const current = search.excludeGlobs.value;
        search.excludeGlobs.value = current ? `${current}, ${glob}` : glob;
      }
      break;
    }

    case "include-type": {
      const ext = context.extension as string;
      if (ext) {
        const glob = `*${ext}`;
        search.includeGlobs.value = glob;
      }
      break;
    }

    case "copy-name": {
      const fileName = relativePath?.split("/").pop() || "";
      await navigator.clipboard.writeText(fileName);
      customMessage.success("已复制文件名");
      break;
    }

    case "copy-path":
      if (filePath) {
        await navigator.clipboard.writeText(filePath);
        customMessage.success("已复制路径");
      }
      break;

    case "copy-all-matches": {
      const fileResult = search.results.value.get(filePath);
      if (fileResult) {
        const lines = fileResult.matches.map(
          (m) => `  ${m.lineNumber},${m.matchStart + 1}: ${m.lineContent}`
        );
        const text = `${filePath}\n${lines.join("\n")}`;
        await navigator.clipboard.writeText(text);
        customMessage.success("已复制当前文件所有匹配");
      }
      break;
    }

    case "copy-all-results": {
      const results = search.resultsList.value;
      if (results.length > 0) {
        const sections: string[] = [];
        let totalMatchesCount = 0;
        for (const fileResult of results) {
          if (fileResult.matches.length > 0) {
            const lines = fileResult.matches.map(
              (m) => `  ${m.lineNumber},${m.matchStart + 1}: ${m.lineContent}`
            );
            sections.push(`${fileResult.filePath}\n${lines.join("\n")}`);
            totalMatchesCount += fileResult.matches.length;
          }
        }
        await navigator.clipboard.writeText(sections.join("\n\n"));
        customMessage.success(
          `已复制全部 ${results.length} 个文件的 ${totalMatchesCount} 个结果`
        );
      }
      break;
    }

    case "reveal-in-explorer":
      if (filePath) {
        try {
          await revealItemInDir(filePath);
        } catch (e) {
          errorHandler.error(e, "打开资源管理器失败");
        }
      }
      break;

    // === 匹配项级操作 ===
    case "replace-match": {
      const matchIndex = context.matchIndex as number;
      if (filePath && matchIndex !== undefined) {
        handleReplaceMatch(filePath, matchIndex);
      }
      break;
    }

    case "dismiss-match": {
      const matchIndex = context.matchIndex as number;
      if (filePath && matchIndex !== undefined) {
        search.dismissMatch(filePath, matchIndex);
      }
      break;
    }
    case "copy-line": {
      const lineContent = context.lineContent as string;
      const lineNumber = context.lineNumber as number;
      const matchStart = context.matchStart as number;
      if (lineContent && filePath) {
        const text = `${filePath}\n  ${lineNumber},${matchStart + 1}: ${lineContent}`;
        await navigator.clipboard.writeText(text);
        customMessage.success("已复制匹配行");
      }
      break;
    }

    // === 目录级操作 ===
    case "dismiss-dir": {
      const dirFilePaths = context.filePaths as string[];
      if (dirFilePaths) {
        for (const fp of dirFilePaths) {
          search.dismissFile(fp);
        }
      }
      break;
    }

    case "restrict-to-dir": {
      const dirPath = context.dirPath as string;
      if (dirPath) {
        // 将搜索限制为该文件夹：设置 includeGlobs 为 dirPath/**
        search.includeGlobs.value = `${dirPath}/**`;
      }
      break;
    }

    case "expand-recursive": {
      // 以递归方式展开：展开该目录下所有目录节点和文件节点
      const dirFilePaths2 = context.filePaths as string[];
      const subDirPaths = context.subDirPaths as string[];
      // 展开目录节点
      if (subDirPaths) {
        searchPanelRef.value?.expandDirs(subDirPaths);
      }
      // 展开文件节点
      if (dirFilePaths2) {
        const newExpanded = new Set(search.expandedFiles.value);
        for (const fp of dirFilePaths2) {
          newExpanded.add(fp);
        }
        search.expandedFiles.value = newExpanded;
      }
      break;
    }

    case "exclude-dir": {
      const dirPath2 = context.dirPath as string;
      if (dirPath2) {
        // 从搜索中排除该文件夹
        const glob = `${dirPath2}/**`;
        const current = search.excludeGlobs.value;
        search.excludeGlobs.value = current ? `${current}, ${glob}` : glob;
      }
      break;
    }

    case "copy-dir-name": {
      const dirName = context.dirName as string;
      if (dirName) {
        await navigator.clipboard.writeText(dirName);
        customMessage.success("已复制目录名");
      }
      break;
    }

    case "copy-dir-path": {
      const dirPath3 = context.dirPath as string;
      if (dirPath3) {
        // 复制完整路径：rootPath + dirPath
        const fullPath = search.rootPath.value
          ? `${search.rootPath.value}/${dirPath3}`
          : dirPath3;
        await navigator.clipboard.writeText(fullPath);
        customMessage.success("已复制路径");
      }
      break;
    }

    case "copy-all-dir-matches": {
      // 复制该目录下所有文件的所有匹配行（VSCode 格式：路径 + 行号,列号: 内容）
      const dirFilePaths3 = context.filePaths as string[];
      if (dirFilePaths3) {
        const sections: string[] = [];
        let totalLines = 0;
        for (const fp of dirFilePaths3) {
          const fileResult = search.results.value.get(fp);
          if (fileResult && fileResult.matches.length > 0) {
            const matchLines = fileResult.matches.map(
              (m) => `  ${m.lineNumber},${m.matchStart + 1}: ${m.lineContent}`
            );
            sections.push(`${fp}\n${matchLines.join("\n")}`);
            totalLines += fileResult.matches.length;
          }
        }
        if (sections.length > 0) {
          await navigator.clipboard.writeText(sections.join("\n"));
          customMessage.success(`已复制 ${totalLines} 行匹配内容`);
        }
      }
      break;
    }
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

// 暴露给子组件通过 inject 使用的事件处理器
// 这些方法需要在 DirSearch 层面协调（因为涉及 targetMatch、contextMenu 等本地状态）
provide("dirSearchActions", {
  handleSelectMatch,
  handleReplaceAll,
  handleReplaceFile,
  handleReplaceMatch,
  handleContextMenu,
});
</script>

<style scoped>
.dir-search {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
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
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
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
