<template>
  <div class="file-preview" @keydown="handleKeydown">
    <!-- 空状态 -->
    <div v-if="!filePath" class="file-preview__empty">
      <FileSearch :size="48" />
      <p>点击搜索结果查看文件内容</p>
    </div>

    <!-- 文件头 -->
    <div v-else class="file-preview__header">
      <div class="file-preview__path-wrapper">
        <span class="file-preview__path" :title="filePath">{{
          relativePath || filePath
        }}</span>
        <span
          v-if="isDirty"
          class="file-preview__dirty-dot"
          title="已修改，未保存"
        />
      </div>
      <div class="file-preview__actions">
        <el-tooltip v-if="isDirty" content="保存 (Ctrl+S)" :show-after="500">
          <button
            class="file-preview__action-btn file-preview__action-btn--save"
            @click="saveFile"
          >
            <Save :size="14" />
          </button>
        </el-tooltip>
        <el-tooltip content="在编辑器中打开" :show-after="500">
          <button class="file-preview__action-btn" @click="openInEditor">
            <ExternalLink :size="14" />
          </button>
        </el-tooltip>
        <el-tooltip content="打开所在目录" :show-after="500">
          <button class="file-preview__action-btn" @click="openDirectory">
            <FolderOpen :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- 文件内容 -->
    <div v-if="filePath" class="file-preview__content">
      <div v-if="isLoading" class="file-preview__loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
      <div v-else-if="loadError" class="file-preview__error">
        <span>{{ loadError }}</span>
      </div>
      <RichCodeEditor
        v-else
        ref="editorRef"
        :model-value="editedContent"
        :language="fileLanguage"
        :read-only="false"
        :line-numbers="true"
        editor-type="monaco"
        :options="monacoEditorOptions"
        class="file-preview__editor"
        @update:model-value="handleContentChange"
        @mount="handleEditorMount"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { FileSearch, ExternalLink, FolderOpen, Save } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import type { SearchMatch, TargetMatch } from "../types";
import type { editor as MonacoEditorType } from "monaco-editor";

const props = defineProps<{
  filePath: string | null;
  relativePath?: string;
  matches?: SearchMatch[];
  targetMatch?: TargetMatch | null;
}>();

const isLoading = ref(false);
const loadError = ref<string | null>(null);
const fileContent = ref(""); // 原始内容（磁盘上的）
const editedContent = ref(""); // 编辑器当前内容
const isSaving = ref(false);

// Monaco 编辑器实例
let monacoEditor: MonacoEditorType.IStandaloneCodeEditor | null = null;
// 装饰集合句柄
let matchLineDecorations: string[] = [];
let targetLineDecorations: string[] = [];
let matchMarkDecorations: string[] = [];

// 修改状态：编辑内容与原始内容不一致
const isDirty = computed(() => editedContent.value !== fileContent.value);

// Monaco 编辑器选项，开启缩略图
const monacoEditorOptions =
  computed<MonacoEditorType.IStandaloneEditorConstructionOptions>(() => ({
    minimap: {
      enabled: true,
      scale: 1,
      showSlider: "mouseover",
    },
    scrollBeyondLastLine: false,
    wordWrap: "off",
    folding: true,
    foldingStrategy: "indentation",
    showFoldingControls: "always",
    renderLineHighlight: "all",
    occurrencesHighlight: "multiFile",
    selectionHighlight: true,
    find: {
      addExtraSpaceOnTop: false,
    },
  }));

function handleContentChange(value: string) {
  editedContent.value = value;
}

// 保存文件
async function saveFile() {
  if (!props.filePath || !isDirty.value || isSaving.value) return;

  isSaving.value = true;
  try {
    await invoke("write_text_file_force", {
      path: props.filePath,
      content: editedContent.value,
    });
    // 保存成功，更新原始内容基准
    fileContent.value = editedContent.value;
    customMessage.success("文件已保存");
  } catch (e: any) {
    customMessage.error(`保存失败: ${e?.message || e}`);
  } finally {
    isSaving.value = false;
  }
}

// 快捷键处理
function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    e.stopPropagation();
    saveFile();
  }
}

// 从文件路径推断语言
const fileLanguage = computed(() => {
  if (!props.filePath) return undefined;
  const fileName = props.filePath.split(/[/\\]/).pop() || "";

  // 特殊文件名映射
  const specialFiles: Record<string, string> = {
    Dockerfile: "dockerfile",
    Makefile: "shell",
    ".gitignore": "shell",
    ".env": "shell",
    ".env.local": "shell",
    ".env.example": "shell",
  };
  if (specialFiles[fileName]) return specialFiles[fileName];

  // 按扩展名推断
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  return ext || undefined;
});

// --- Monaco 匹配高亮 ---

function clearDecorations() {
  if (!monacoEditor) return;
  matchLineDecorations = monacoEditor.deltaDecorations(
    matchLineDecorations,
    []
  );
  targetLineDecorations = monacoEditor.deltaDecorations(
    targetLineDecorations,
    []
  );
  matchMarkDecorations = monacoEditor.deltaDecorations(
    matchMarkDecorations,
    []
  );
}

function applyMatchHighlights() {
  if (!monacoEditor) return;

  const matchList = props.matches || [];

  // 整行高亮装饰（去重行号）
  const uniqueLines = [...new Set(matchList.map((m) => m.lineNumber))];
  const lineDecos: MonacoEditorType.IModelDeltaDecoration[] = uniqueLines.map(
    (lineNum) => ({
      range: {
        startLineNumber: lineNum,
        startColumn: 1,
        endLineNumber: lineNum,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: "monaco-highlight-match-line",
        overviewRuler: {
          color: "rgba(64, 158, 255, 0.4)",
          position: 1, // OverviewRulerLane.Left
        },
      },
    })
  );
  matchLineDecorations = monacoEditor.deltaDecorations(
    matchLineDecorations,
    lineDecos
  );

  // 关键字文本高亮装饰
  const markDecos: MonacoEditorType.IModelDeltaDecoration[] = matchList
    .map((m) => {
      const model = monacoEditor!.getModel();
      if (!model) return null;
      const lineContent = model.getLineContent(m.lineNumber);
      const startCol = m.matchStart + 1;
      const endCol = m.matchEnd + 1;
      if (startCol > endCol || endCol > lineContent.length + 1) return null;
      return {
        range: {
          startLineNumber: m.lineNumber,
          startColumn: startCol,
          endLineNumber: m.lineNumber,
          endColumn: endCol,
        },
        options: {
          inlineClassName: "monaco-search-match-text",
          minimap: {
            color: "rgba(230, 162, 60, 0.8)",
            position: 2, // MinimapPosition.Inline
          },
        },
      } as MonacoEditorType.IModelDeltaDecoration;
    })
    .filter((d): d is MonacoEditorType.IModelDeltaDecoration => d !== null);

  matchMarkDecorations = monacoEditor.deltaDecorations(
    matchMarkDecorations,
    markDecos
  );
}

function applyTargetMatch() {
  if (!monacoEditor) return;

  const target = props.targetMatch || null;
  if (!target) {
    targetLineDecorations = monacoEditor.deltaDecorations(
      targetLineDecorations,
      []
    );
    return;
  }

  const model = monacoEditor.getModel();
  if (!model) return;

  const lineCount = model.getLineCount();
  if (target.lineNumber < 1 || target.lineNumber > lineCount) {
    targetLineDecorations = monacoEditor.deltaDecorations(
      targetLineDecorations,
      []
    );
    return;
  }

  const decos: MonacoEditorType.IModelDeltaDecoration[] = [
    // 整行背景高亮
    {
      range: {
        startLineNumber: target.lineNumber,
        startColumn: 1,
        endLineNumber: target.lineNumber,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: "monaco-highlight-target-line",
        overviewRuler: {
          color: "rgba(64, 158, 255, 0.8)",
          position: 4, // OverviewRulerLane.Center
        },
      },
    },
    // 目标匹配文本高亮
    {
      range: {
        startLineNumber: target.lineNumber,
        startColumn: target.matchStart + 1,
        endLineNumber: target.lineNumber,
        endColumn: target.matchEnd + 1,
      },
      options: {
        inlineClassName: "monaco-search-match-text-active",
        minimap: {
          color: "rgba(64, 158, 255, 1.0)",
          position: 2,
        },
      },
    },
  ];

  targetLineDecorations = monacoEditor.deltaDecorations(
    targetLineDecorations,
    decos
  );

  // 滚动到目标行，并设置光标
  // 强制布局更新，确保滚动位置计算准确（特别是新打开文件时）
  monacoEditor.layout();
  monacoEditor.revealLineInCenter(target.lineNumber, 0 /* Smooth */);
  monacoEditor.setSelection({
    startLineNumber: target.lineNumber,
    startColumn: target.matchStart + 1,
    endLineNumber: target.lineNumber,
    endColumn: target.matchEnd + 1,
  });
}

function handleEditorMount(
  editor: MonacoEditorType.IStandaloneCodeEditor | any
) {
  monacoEditor = editor as MonacoEditorType.IStandaloneCodeEditor;

  // 挂载后立即应用高亮
  nextTick(() => {
    applyMatchHighlights();
    applyTargetMatch();
  });
}

async function loadFile(path: string) {
  isLoading.value = true;
  loadError.value = null;
  fileContent.value = "";
  editedContent.value = "";
  // 清空旧实例引用，避免对已销毁的编辑器操作
  monacoEditor = null;
  clearDecorations();

  try {
    const content = await invoke<string>("read_text_file_force", { path });
    fileContent.value = content;
    editedContent.value = content;
  } catch (e: any) {
    loadError.value = `无法读取文件: ${e?.message || e}`;
  } finally {
    isLoading.value = false;
  }
}

async function openInEditor() {
  if (!props.filePath) return;
  try {
    await invoke("open_path_force", { path: props.filePath });
  } catch {
    // 静默处理
  }
}

async function openDirectory() {
  if (!props.filePath) return;
  try {
    await invoke("open_file_directory", { filePath: props.filePath });
  } catch {
    // 静默处理
  }
}

watch(
  () => props.filePath,
  (newPath) => {
    if (newPath) {
      loadFile(newPath);
    } else {
      fileContent.value = "";
    }
  },
  { immediate: true }
);

watch(
  () => props.matches,
  () => {
    nextTick(() => applyMatchHighlights());
  }
);

watch(
  () => props.targetMatch,
  () => {
    nextTick(() => applyTargetMatch());
  }
);
</script>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--card-bg);
}

.file-preview__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.file-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.file-preview__path-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  overflow: hidden;
}

.file-preview__path {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview__dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-warning);
  flex-shrink: 0;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.file-preview__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.file-preview__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.file-preview__action-btn:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--el-color-primary);
}

.file-preview__action-btn--save {
  color: var(--el-color-warning);
}

.file-preview__action-btn--save:hover {
  background-color: rgba(
    var(--el-color-warning-rgb, 230, 162, 60),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--el-color-warning);
}

.file-preview__content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-preview__loading,
.file-preview__error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.file-preview__error {
  color: var(--el-color-danger);
}

.file-preview__editor {
  flex: 1;
  height: 100%;
  border: none;
  border-radius: 0;
}

/* 覆盖 RichCodeEditor 的外层边框，预览场景不需要 */
.file-preview__editor :deep(.rich-code-editor-wrapper) {
  border: none;
  border-radius: 0;
}

/* Monaco 搜索匹配整行高亮 */
.file-preview__editor :deep(.monaco-highlight-match-line) {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.06);
}

/* Monaco 目标行高亮 */
.file-preview__editor :deep(.monaco-highlight-target-line) {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.14);
}

/* Monaco 搜索关键字文本高亮 */
.file-preview__editor :deep(.monaco-search-match-text) {
  background-color: rgba(var(--el-color-warning-rgb, 230, 162, 60), 0.45);
  border-radius: 2px;
}

/* Monaco 当前聚焦匹配项文本高亮 */
.file-preview__editor :deep(.monaco-search-match-text-active) {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.5);
  border-radius: 2px;
  outline: 1px solid rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.8);
}
</style>
