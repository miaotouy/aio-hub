<template>
  <div
    class="cm-viewer-container"
    :class="{
      expanded: isExpanded,
      'is-streaming': !closed,
    }"
    ref="containerRef"
  ></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef, computed } from "vue";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { defaultKeymap } from "@codemirror/commands";
import { useTheme } from "@composables/useTheme";
import { getCodeMirrorLanguage } from "@/utils/codeLanguages";
import { vscodeLight, vscodeDark } from "@uiw/codemirror-theme-vscode";

const props = defineProps<{
  content: string;
  language?: string;
  isExpanded: boolean;
  codeFontSize: number;
  wordWrapEnabled: boolean;
  closed?: boolean;
}>();

const emit = defineEmits<{
  (e: "ready", fontSize: number): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
let isDestroyed = false;
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const fontSizeCompartment = new Compartment();
const wordWrapCompartment = new Compartment();

const { isDark } = useTheme();
const cmTheme = computed(() => (isDark.value ? vscodeDark : vscodeLight));

const initEditor = async () => {
  if (!containerRef.value) return;

  const extensions = [
    EditorView.editable.of(false), // 只读
    EditorState.readOnly.of(true),
    themeCompartment.of(cmTheme.value),
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter(),
    keymap.of([...defaultKeymap, ...foldKeymap]),
    // 基础样式
    EditorView.theme({
      "&": {
        fontSize: `${props.codeFontSize}px`,
        backgroundColor: "transparent !important",
      },
      ".cm-scroller": {
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
      },
      ".cm-content": {
        padding: "12px 0",
      },
    }),
    fontSizeCompartment.of(
      EditorView.theme({
        "&": { fontSize: `${props.codeFontSize}px` },
      }),
    ),
    wordWrapCompartment.of(props.wordWrapEnabled ? EditorView.lineWrapping : []),
    languageCompartment.of([]),
  ];

  const state = EditorState.create({
    doc: props.content,
    extensions,
  });

  editorView.value = new EditorView({
    state,
    parent: containerRef.value,
  });

  emit("ready", props.codeFontSize);
// 加载语言
if (props.language) {
  const langExt = await getCodeMirrorLanguage(props.language);

  // 如果在异步加载期间组件已卸载，则清理并退出
  if (isDestroyed) {
    if (editorView.value) {
      editorView.value.destroy();
      editorView.value = null;
    }
    return;
  }

  if (langExt && editorView.value) {
    editorView.value.dispatch({
      effects: languageCompartment.reconfigure(langExt),
    });
  }
}
};

watch(
  () => props.content,
  (newContent) => {
    if (editorView.value && newContent !== editorView.value.state.doc.toString()) {
      editorView.value.dispatch({
        changes: { from: 0, to: editorView.value.state.doc.length, insert: newContent },
      });
    }
  },
);

watch(cmTheme, (newTheme) => {
  if (editorView.value) {
    editorView.value.dispatch({
      effects: themeCompartment.reconfigure(newTheme),
    });
  }
});

watch(
  () => props.codeFontSize,
  (size) => {
    if (editorView.value) {
      editorView.value.dispatch({
        effects: fontSizeCompartment.reconfigure(
          EditorView.theme({
            "&": { fontSize: `${size}px` },
          }),
        ),
      });
    }
  },
);

watch(
  () => props.wordWrapEnabled,
  (enabled) => {
    if (editorView.value) {
      editorView.value.dispatch({
        effects: wordWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : []),
      });
    }
  },
);

onMounted(() => {
  initEditor();
});

onUnmounted(() => {
  isDestroyed = true;
  if (editorView.value) {
    editorView.value.destroy();
    editorView.value = null;
  }
});
</script>

<style scoped>
.cm-viewer-container {
  width: 100%;
  height: auto;
  max-height: 500px;
  min-height: 20px;
  position: relative;
  background-color: var(--container-bg);
  border-radius: 0 0 6px 6px;
  transition: max-height 0.3s ease-in-out;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 必须裁剪，配合 flex 内部滚动 */
}

.cm-viewer-container.is-streaming {
  transition: none !important;
}

:deep(.cm-editor) {
  outline: none !important;
  background-color: transparent !important;
  flex: 1;
  min-height: 0;
}

:deep(.cm-scroller) {
  scrollbar-width: thin;
  scrollbar-color: rgba(121, 121, 121, 0) transparent;
  overflow: auto !important;
  height: 100%;
  transition: scrollbar-color 0.3s ease;
}

.cm-viewer-container:hover :deep(.cm-scroller) {
  scrollbar-color: rgba(121, 121, 121, 0.4) transparent;
}

/* 仿 Monaco 风格滚动条 - Webkit 系 */
:deep(.cm-scroller)::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

:deep(.cm-scroller)::-webkit-scrollbar-track {
  background: transparent;
}

:deep(.cm-scroller)::-webkit-scrollbar-thumb {
  background-color: rgba(121, 121, 121, 0); /* 默认隐藏 */
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: padding-box;
  min-height: 40px;
  transition: background-color 0.3s ease;
}

.cm-viewer-container:hover :deep(.cm-scroller)::-webkit-scrollbar-thumb {
  background-color: rgba(121, 121, 121, 0.4);
}

:deep(.cm-scroller)::-webkit-scrollbar-thumb:hover {
  background-color: rgba(121, 121, 121, 0.7) !important;
}

:deep(.cm-scroller)::-webkit-scrollbar-thumb:active {
  background-color: rgba(121, 121, 121, 0.85) !important;
}

:deep(.cm-scroller)::-webkit-scrollbar-corner {
  background: transparent;
}

:deep(.cm-gutters) {
  background-color: transparent !important;
  border-right: none !important;
  user-select: none;
}

:deep(.cm-lineNumbers .cm-gutterElement) {
  padding: 0 8px 0 12px !important;
  min-width: 40px;
  opacity: 0.5;
}

:deep(.cm-foldGutter .cm-gutterElement) {
  padding: 0 4px !important;
  opacity: 0.5;
  cursor: pointer;
}

:deep(.cm-foldGutter .cm-gutterElement:hover) {
  opacity: 1;
}
</style>
