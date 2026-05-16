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
        <span class="file-preview__path" :title="filePath">{{ relativePath || filePath }}</span>
        <span v-if="isDirty" class="file-preview__dirty-dot" title="已修改，未保存" />
      </div>
      <div class="file-preview__actions">
        <el-tooltip v-if="isDirty" content="保存 (Ctrl+S)" :show-after="500">
          <button class="file-preview__action-btn file-preview__action-btn--save" @click="saveFile">
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
        editor-type="codemirror"
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
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, type Range } from "@codemirror/state";
import { customMessage } from "@/utils/customMessage";
import type { SearchMatch, TargetMatch } from "../types";

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
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);

// 修改状态：编辑内容与原始内容不一致
const isDirty = computed(() => editedContent.value !== fileContent.value);

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
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
  return ext || undefined;
});

// --- CodeMirror 匹配行高亮 ---
const setHighlightLinesEffect = StateEffect.define<number[]>();

const highlightLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlightLinesEffect)) {
        const lines = effect.value;
        const builder: any[] = [];
        for (const lineNum of lines) {
          if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNum);
            builder.push(highlightLineDeco.range(line.from));
          }
        }
        return Decoration.set(builder);
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const highlightLineDeco = Decoration.line({ class: "cm-highlight-match-line" });

// 目标行（当前聚焦行）高亮
const setTargetMatchEffect = StateEffect.define<TargetMatch | null>();

const targetLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setTargetMatchEffect)) {
        const target = effect.value;
        if (target && target.lineNumber >= 1 && target.lineNumber <= tr.state.doc.lines) {
          const line = tr.state.doc.line(target.lineNumber);
          const builder: Range<Decoration>[] = [targetLineDeco.range(line.from)];

          // 同时也给目标匹配项添加醒目的文本高亮
          const from = line.from + target.matchStart;
          const to = line.from + target.matchEnd;
          if (to <= line.to) {
            builder.push(activeMatchMarkDeco.range(from, to));
          }
          builder.sort((a, b) => a.from - b.from);
          return Decoration.set(builder);
        }
        return Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const targetLineDeco = Decoration.line({ class: "cm-highlight-target-line" });
const activeMatchMarkDeco = Decoration.mark({ class: "cm-search-match-text-active" });

// 全文关键字高亮
const setMatchMarksEffect = StateEffect.define<SearchMatch[]>();

const matchMarkField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMatchMarksEffect)) {
        const matches = effect.value;
        const builder: Range<Decoration>[] = [];
        for (const m of matches) {
          if (m.lineNumber >= 1 && m.lineNumber <= tr.state.doc.lines) {
            const line = tr.state.doc.line(m.lineNumber);
            const from = line.from + m.matchStart;
            const to = line.from + m.matchEnd;
            if (to <= line.to) {
              builder.push(matchMarkDeco.range(from, to));
            }
          }
        }
        builder.sort((a, b) => a.from - b.from);
        return Decoration.set(builder);
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const matchMarkDeco = Decoration.mark({ class: "cm-search-match-text" });

let editorMounted = false;

function handleEditorMount() {
  editorMounted = true;
  // 编辑器挂载后，注入高亮 StateField
  nextTick(() => {
    const view = editorRef.value?.editorView;
    if (!view) return;

    // 动态添加 StateField（通过 appendConfig）
    view.dispatch({
      effects: StateEffect.appendConfig.of([highlightLineField, targetLineField, matchMarkField, highlightTheme]),
    });

    // 应用当前的匹配高亮
    applyMatchHighlights();
    applyTargetMatch();
  });
}

function applyMatchHighlights() {
  const view = editorRef.value?.editorView;
  if (!view || !editorMounted) return;

  const matchList = props.matches || [];
  const lineNumbers = matchList.map((m) => m.lineNumber);
  // 去重
  const uniqueLines = [...new Set(lineNumbers)];

  view.dispatch({
    effects: [setHighlightLinesEffect.of(uniqueLines), setMatchMarksEffect.of(matchList)],
  });
}

function applyTargetMatch() {
  const view = editorRef.value?.editorView;
  if (!view || !editorMounted) return;

  const target = props.targetMatch || null;
  view.dispatch({
    effects: setTargetMatchEffect.of(target),
  });

  // 滚动到目标行
  if (target && target.lineNumber >= 1 && target.lineNumber <= view.state.doc.lines) {
    const line = view.state.doc.line(target.lineNumber);
    // 精确定位到匹配起始位置
    const targetPos = line.from + target.matchStart;
    view.dispatch({
      effects: EditorView.scrollIntoView(targetPos, { y: "center" }),
      // 同时设置选区到匹配项
      selection: { anchor: targetPos, head: line.from + target.matchEnd },
    });
  }
}
// 高亮样式主题
const highlightTheme = EditorView.baseTheme({
  ".cm-highlight-match-line": {
    backgroundColor: "rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.06)",
  },
  ".cm-highlight-target-line": {
    backgroundColor: "rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.14)",
  },
  ".cm-search-match-text": {
    backgroundColor: "rgba(var(--el-color-warning-rgb, 230, 162, 60), 0.35)",
    borderRadius: "2px",
  },
  ".cm-search-match-text-active": {
    backgroundColor: "rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.4)",
    borderRadius: "2px",
    outline: "1px solid rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.6)",
  },
});

async function loadFile(path: string) {
  isLoading.value = true;
  loadError.value = null;
  fileContent.value = "";
  editedContent.value = "";
  editorMounted = false;

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
  { immediate: true },
);

watch(
  () => props.matches,
  () => {
    nextTick(() => applyMatchHighlights());
  },
);

watch(
  () => props.targetMatch,
  () => {
    nextTick(() => applyTargetMatch());
  },
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
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  color: var(--el-color-primary);
}

.file-preview__action-btn--save {
  color: var(--el-color-warning);
}

.file-preview__action-btn--save:hover {
  background-color: rgba(var(--el-color-warning-rgb, 230, 162, 60), calc(var(--card-opacity) * 0.1));
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
</style>
