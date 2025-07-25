<template>
  <div class="rich-code-editor-wrapper" ref="wrapperRef">
    <div v-if="title" class="editor-header">
      <span class="editor-title">{{ title }}</span>
      <div v-if="showCharCount && content" class="char-count">
        {{ content.length }} 字符
      </div>
    </div>
    <div ref="editorContainerRef" class="editor-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef, computed } from "vue";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  keymap,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { foldGutter, foldKeymap } from "@codemirror/language";

const props = defineProps<{
  modelValue: string;
  language?: "json" | "markdown" | "javascript" | "text" | string;
  title?: string;
  showCharCount?: boolean;
  readOnly?: boolean;
  lineNumbers?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const editorContainerRef = ref<HTMLDivElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const editableCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const foldGutterCompartment = new Compartment();
const wrapperRef = ref<HTMLDivElement | null>(null);

const content = computed(() => props.modelValue);

onMounted(() => {
  if (!editorContainerRef.value) return;

  const extensions = [
    // 基础主题 - 简化版，不依赖外部主题包
    EditorView.theme({
      "&": {
        color: "var(--text-color)",
        backgroundColor: "var(--input-bg)",
      },
      ".cm-content": {
        padding: "12px",
        minHeight: "200px",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-editor": {
        fontSize: "14px",
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
      },
    }),
    editableCompartment.of(EditorView.editable.of(!(props.readOnly ?? false))),
    lineNumbersCompartment.of(props.lineNumbers ?? true ? lineNumbers() : []),
    foldGutterCompartment.of(foldGutter()),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    closeBrackets(),
    autocompletion(),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        emit("update:modelValue", newContent);
      }
    }),
    EditorView.domEventHandlers({
      focus(_event, _view) {
        wrapperRef.value?.classList.add("is-focused");
      },
      blur(_event, _view) {
        wrapperRef.value?.classList.remove("is-focused");
      },
    }),
  ];

  // 添加语言支持
  if (props.language) {
    switch (props.language.toLowerCase()) {
      case "javascript":
      case "js":
        extensions.push(javascript({ jsx: true }));
        break;
      case "json":
        extensions.push(json());
        break;
      case "markdown":
      case "md":
        extensions.push(markdown());
        break;
      default:
        break;
    }
  }

  const startState = EditorState.create({
    doc: props.modelValue,
    extensions,
  });

  const view = new EditorView({
    state: startState,
    parent: editorContainerRef.value,
  });
  
  editorView.value = view;
});

onUnmounted(() => {
  editorView.value?.destroy();
});

// 监听 modelValue 变化
watch(
  () => props.modelValue,
  (newVal) => {
    if (editorView.value && newVal !== editorView.value.state.doc.toString()) {
      editorView.value.dispatch({
        changes: { from: 0, to: editorView.value.state.doc.length, insert: newVal },
      });
    }
  }
);

// 监听配置变化
watch(
  () => props.readOnly,
  (isReadOnly) => {
    if (editorView.value) {
      editorView.value.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(!(isReadOnly ?? false))),
      });
    }
  }
);

watch(
  () => props.lineNumbers,
  (show) => {
    if (editorView.value) {
      editorView.value.dispatch({
        effects: lineNumbersCompartment.reconfigure(show ?? true ? lineNumbers() : []),
      });
    }
  }
);

// 暴露一些有用的方法
const getContent = (): string => {
  return editorView.value?.state.doc.toString() || "";
};

const setContent = (newContent: string): void => {
  if (editorView.value) {
    editorView.value.dispatch({
      changes: { from: 0, to: editorView.value.state.doc.length, insert: newContent },
    });
  }
};

const focusEditor = (): void => {
  editorView.value?.focus();
};

defineExpose({
  getContent,
  setContent,
  focusEditor,
  editorView,
});
</script>

<style scoped>
.rich-code-editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--card-bg);
  transition: border-color 0.2s ease-in-out;
}

.rich-code-editor-wrapper.is-focused {
  border-color: var(--primary-color);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.9em;
}

.editor-title {
  font-weight: 600;
  color: var(--text-color);
}

.char-count {
  font-size: 12px;
  color: var(--text-color-light);
}

.editor-container {
  flex-grow: 1;
  overflow: auto;
  position: relative;
}

:deep(.cm-editor) {
  height: 100%;
  width: 100%;
}

:deep(.cm-content) {
  padding: 12px;
}

:deep(.cm-scroller) {
  touch-action: auto;
}

@media (max-width: 600px) {
  :deep(.cm-editor) {
    font-size: 12px;
  }

  .editor-header {
    font-size: 0.8em;
    padding: 6px 10px;
  }
}
</style>
