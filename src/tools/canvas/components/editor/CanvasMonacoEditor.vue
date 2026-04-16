<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, shallowRef } from "vue";
import * as monaco from "monaco-editor";
import { useTheme } from "@/composables/useTheme";
import { monacoModelManager } from "./MonacoModelManager";
import type { CanvasMonacoEditorProps, CanvasMonacoEditorEmits } from "./types";

const props = withDefaults(defineProps<CanvasMonacoEditorProps>(), {
  readonly: false,
  canvasId: "default",
});

const emit = defineEmits<CanvasMonacoEditorEmits>();

const containerRef = ref<HTMLDivElement | null>(null);
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

const { isDark } = useTheme();
const monacoTheme = computed(() => (isDark.value ? "vs-dark" : "vs"));

// --- 初始化与销毁 ---

const initEditor = () => {
  if (!containerRef.value) return;

  const model = monacoModelManager.getOrCreateModel(
    props.canvasId,
    props.filepath,
    props.modelValue,
    props.language
  );

  editorInstance.value = monaco.editor.create(containerRef.value, {
    model,
    theme: monacoTheme.value,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    wordWrap: "on",
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    renderLineHighlight: "all",
    folding: true,
    readOnly: props.readonly,
    ...props.options,
  });

  // 监听内容变化
  editorInstance.value.onDidChangeModelContent(() => {
    const value = editorInstance.value?.getValue() || "";
    emit("update:modelValue", value);
  });

  // 监听光标位置
  editorInstance.value.onDidChangeCursorPosition((e) => {
    emit("cursorPositionChange", e.position);
  });

  // 监听 Markers (错误/警告)
  const modelUri = model.uri;
  monaco.editor.onDidChangeMarkers(([uri]) => {
    if (uri.toString() === modelUri.toString()) {
      const markers = monaco.editor.getModelMarkers({ resource: modelUri });
      emit("markersChange", markers);
    }
  });

  emit("editorReady", editorInstance.value);
};

const destroyEditor = () => {
  if (editorInstance.value) {
    editorInstance.value.dispose();
    editorInstance.value = null;
  }
};

// --- 监听属性变化 ---

// 切换文件或画布
watch(
  () => [props.canvasId, props.filepath],
  ([newCanvasId, newFilepath]) => {
    if (!editorInstance.value) return;

    const model = monacoModelManager.getOrCreateModel(
      newCanvasId as string,
      newFilepath as string,
      props.modelValue,
      props.language
    );
    
    editorInstance.value.setModel(model);
  }
);

// 语言切换
watch(
  () => props.language,
  (newLang) => {
    const model = editorInstance.value?.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, newLang);
    }
  }
);

// 只读状态
watch(
  () => props.readonly,
  (newVal) => {
    editorInstance.value?.updateOptions({ readOnly: newVal });
  }
);

// 主题切换
watch(monacoTheme, (newTheme) => {
  monaco.editor.setTheme(newTheme);
});

// 外部 modelValue 变化同步 (非用户输入引起的变化)
watch(
  () => props.modelValue,
  (newVal) => {
    if (editorInstance.value && newVal !== editorInstance.value.getValue()) {
      editorInstance.value.setValue(newVal);
    }
  }
);

onMounted(() => {
  initEditor();
});

onUnmounted(() => {
  destroyEditor();
});

// --- 暴露方法 ---

defineExpose({
  editor: editorInstance,
  revealPosition: (line: number, column: number) => {
    if (editorInstance.value) {
      editorInstance.value.revealPositionInCenter({ lineNumber: line, column });
      editorInstance.value.setPosition({ lineNumber: line, column });
      editorInstance.value.focus();
    }
  },
  addDecorations: (decorations: monaco.editor.IModelDeltaDecoration[]) => {
    return editorInstance.value?.deltaDecorations([], decorations) || [];
  },
  clearDecorations: (ids: string[]) => {
    editorInstance.value?.deltaDecorations(ids, []);
  },
});
</script>

<template>
  <div class="canvas-monaco-editor-container" ref="containerRef"></div>
</template>

<style scoped lang="scss">
.canvas-monaco-editor-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;

  /* 适配主题外观：复用 RichCodeEditor 的样式逻辑 */
  :deep(.monaco-editor) {
    --vscode-editor-background: var(--code-block-bg, var(--input-bg)) !important;
    --vscode-editorGutter-background: var(--code-block-bg, var(--input-bg)) !important;
    --vscode-editorStickyScrollGutter-background: var(--code-block-bg, var(--card-bg)) !important;
    --vscode-editorStickyScroll-background: var(--code-block-bg, var(--card-bg)) !important;
    --vscode-editorStickyScroll-shadow: var(--code-block-bg, var(--card-bg)) !important;
    
    background-color: var(--vscode-editor-background) !important;
  }

  :deep(.monaco-editor .monaco-editor-background),
  :deep(.monaco-editor .overflow-guard),
  :deep(.monaco-editor .lines-content) {
    background-color: var(--vscode-editor-background) !important;
  }

  :deep(.monaco-editor .margin) {
    background-color: var(--vscode-editorGutter-background) !important;
  }

  :deep(.monaco-scrollable-element > .scrollbar > .slider) {
    background: var(--scrollbar-thumb-color) !important;
  }

  :deep(.monaco-scrollable-element > .scrollbar > .slider:hover) {
    background: var(--scrollbar-thumb-hover-color) !important;
  }
}
</style>