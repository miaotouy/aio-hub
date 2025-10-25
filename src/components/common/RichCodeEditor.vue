<template>
  <div class="rich-code-editor-wrapper" ref="wrapperRef">
    <!-- CodeMirror 编辑器 -->
    <div v-if="props.editorType === 'codemirror'" ref="editorContainerRef" class="editor-container"></div>
    
    <!-- Monaco 编辑器 -->
    <vue-monaco-editor
      v-else-if="props.editorType === 'monaco'"
      v-model:value="monacoValue"
      :language="getMonacoLanguage()"
      :options="monacoOptions"
      :theme="monacoTheme"
      class="monaco-editor-container"
      @mount="handleMonacoMount"
      @focus="handleMonacoFocus"
      @blur="handleMonacoBlur"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef, computed } from "vue";
import { useTheme } from "@composables/useTheme";
import { VueMonacoEditor } from '@guolao/vue-monaco-editor';
import type { editor as MonacoEditor } from 'monaco-editor';
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
import { css } from "@codemirror/lang-css";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { githubLight } from "@uiw/codemirror-theme-github";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";

const props = withDefaults(defineProps<{
  modelValue: string;
  language?: "json" | "markdown" | "javascript" | "css" | "text" | string;
  readOnly?: boolean;
  lineNumbers?: boolean;
  editorType?: 'codemirror' | 'monaco';
}>(), {
  editorType: 'codemirror',
  lineNumbers: true,
  readOnly: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const editorContainerRef = ref<HTMLDivElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const editableCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const foldGutterCompartment = new Compartment();
const themeCompartment = new Compartment();
const wrapperRef = ref<HTMLDivElement | null>(null);

// Monaco Editor 相关状态
const monacoEditorInstance = shallowRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
const monacoValue = ref(props.modelValue);

// Monaco Editor 配置
const monacoOptions = computed<MonacoEditor.IStandaloneEditorConstructionOptions>(() => ({
  readOnly: props.readOnly ?? false,
  lineNumbers: (props.lineNumbers ?? true) ? 'on' : 'off',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
  wordWrap: 'on',
  automaticLayout: true,
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  renderLineHighlight: 'all',
  folding: true,
  foldingStrategy: 'indentation',
  showFoldingControls: 'always',
}));

// Monaco 主题（根据 CSS 变量动态生成）
const monacoTheme = ref('vs-dark');
// Monaco 语言映射
const getMonacoLanguage = () => {
  if (!props.language) return 'plaintext';
  const lang = props.language.toLowerCase();
  switch (lang) {
    case 'javascript':
    case 'js':
      return 'javascript';
    case 'json':
      return 'json';
    case 'markdown':
    case 'md':
      return 'markdown';
    case 'css':
      return 'css';
    case 'text':
      return 'plaintext';
    default:
      return lang;
  }
};

// Monaco Editor 事件处理
const handleMonacoMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
  monacoEditorInstance.value = editor;
  
  // 定义自定义主题以适配全局 CSS 变量
  const monaco = (window as any).monaco;
  if (monaco) {
    monaco.editor.defineTheme('custom-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#00000000', // 透明背景，使用外层的背景色
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#2a2a2a',
        'editorLineNumber.foreground': '#858585',
        'editorGutter.background': '#00000000',
      }
    });
    monaco.editor.setTheme('custom-theme');
  }
};

const handleMonacoFocus = () => {
  wrapperRef.value?.classList.add("is-focused");
};

const handleMonacoBlur = () => {
  wrapperRef.value?.classList.remove("is-focused");
};

// 主题切换
const { isDark } = useTheme();
const cmTheme = computed(() => isDark.value ? tokyoNight : githubLight);

// 监听 Monaco 值变化并同步到父组件
watch(monacoValue, (newVal) => {
  if (props.editorType === 'monaco' && newVal !== props.modelValue) {
    emit("update:modelValue", newVal);
  }
});

onMounted(() => {
  if (props.editorType !== 'codemirror' || !editorContainerRef.value) return;

  const extensions = [
    themeCompartment.of(cmTheme.value),
    // 基础主题 - 完全适配全局 CSS 变量
    EditorView.theme({
      "&": {
        color: "var(--text-color)",
        backgroundColor: "var(--input-bg)",
      },
      ".cm-content": {
        padding: "12px",
        minHeight: "200px",
        color: "var(--text-color)",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-editor": {
        fontSize: "14px",
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        color: "var(--text-color)",
        backgroundColor: "var(--input-bg)",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
        color: "var(--text-color)",
      },
      // 行号样式
      ".cm-lineNumbers": {
        color: "var(--text-color-light)",
        backgroundColor: "var(--input-bg)",
        borderRight: "1px solid var(--border-color-light)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        color: "var(--text-color-light)",
      },
      // 活跃行高亮
      ".cm-activeLine": {
        backgroundColor: "var(--border-color-light)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--border-color-light)",
      },
      // 选择样式
      ".cm-selectionBackground": {
        backgroundColor: "var(--primary-color)",
        opacity: "0.3",
      },
      "&.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--primary-color)",
        opacity: "0.3",
      },
      // 光标样式
      ".cm-cursor": {
        borderLeftColor: "var(--text-color)",
      },
      // 搜索匹配高亮
      ".cm-searchMatch": {
        backgroundColor: "var(--primary-color)",
        color: "#fff",
        opacity: "0.8",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "var(--primary-hover-color)",
      },
      // 折叠装订线
      ".cm-foldGutter": {
        color: "var(--text-color-light)",
        backgroundColor: "var(--input-bg)",
      },
      ".cm-foldGutter .cm-gutterElement": {
        color: "var(--text-color-light)",
      },
      // 括号匹配
      ".cm-matchingBracket": {
        backgroundColor: "var(--border-color)",
        outline: "1px solid var(--primary-color)",
      },
      ".cm-nonmatchingBracket": {
        backgroundColor: "var(--error-color)",
        color: "#fff",
      },
      // 自动补全面板
      ".cm-tooltip": {
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--border-color)",
        color: "var(--text-color)",
      },
      ".cm-tooltip-autocomplete": {
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--border-color)",
      },
      ".cm-tooltip-autocomplete ul li": {
        color: "var(--text-color)",
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: "var(--primary-color)",
        color: "#fff",
      },
      // 滚动条样式适配
      ".cm-scroller::-webkit-scrollbar": {
        width: "8px",
        height: "8px",
      },
      ".cm-scroller::-webkit-scrollbar-track": {
        background: "var(--bg-color)",
        borderRadius: "10px",
      },
      ".cm-scroller::-webkit-scrollbar-thumb": {
        background: "var(--scrollbar-thumb-color)",
        borderRadius: "10px",
      },
      ".cm-scroller::-webkit-scrollbar-thumb:hover": {
        background: "var(--scrollbar-thumb-hover-color)",
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
      case "css":
        extensions.push(css());
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
    if (props.editorType === 'codemirror') {
      if (editorView.value && newVal !== editorView.value.state.doc.toString()) {
        editorView.value.dispatch({
          changes: { from: 0, to: editorView.value.state.doc.length, insert: newVal },
        });
      }
    } else if (props.editorType === 'monaco') {
      if (newVal !== monacoValue.value) {
        monacoValue.value = newVal;
      }
    }
  }
);

// 监听配置变化 - CodeMirror
watch(
  () => props.readOnly,
  (isReadOnly) => {
    if (props.editorType === 'codemirror' && editorView.value) {
      editorView.value.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(!(isReadOnly ?? false))),
      });
    }
    // Monaco 通过 computed options 自动响应
  }
);

watch(
  () => props.lineNumbers,
  (show) => {
    if (props.editorType === 'codemirror' && editorView.value) {
      editorView.value.dispatch({
        effects: lineNumbersCompartment.reconfigure(show ?? true ? lineNumbers() : []),
      });
    }
    // Monaco 通过 computed options 自动响应
  }
);

watch(cmTheme, (newTheme) => {
  if (props.editorType === 'codemirror' && editorView.value) {
    editorView.value.dispatch({
      effects: themeCompartment.reconfigure(newTheme),
    });
  }
});

// 暴露一些有用的方法（统一 CodeMirror 和 Monaco 的 API）
const getContent = (): string => {
  if (props.editorType === 'codemirror') {
    return editorView.value?.state.doc.toString() || "";
  } else {
    return monacoEditorInstance.value?.getValue() || "";
  }
};

const setContent = (newContent: string): void => {
  if (props.editorType === 'codemirror') {
    if (editorView.value) {
      editorView.value.dispatch({
        changes: { from: 0, to: editorView.value.state.doc.length, insert: newContent },
      });
    }
  } else {
    if (monacoEditorInstance.value) {
      monacoEditorInstance.value.setValue(newContent);
    }
  }
};

const focusEditor = (): void => {
  if (props.editorType === 'codemirror') {
    editorView.value?.focus();
  } else {
    monacoEditorInstance.value?.focus();
  }
};

defineExpose({
  getContent,
  setContent,
  focusEditor,
  editorView,
  monacoEditorInstance,
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

.editor-container,
.monaco-editor-container {
  flex-grow: 1;
  overflow: auto;
  position: relative;
  height: 100%;
  width: 100%;
}

/* Monaco Editor 样式覆盖以适配主题 */
.monaco-editor-container :deep(.monaco-editor) {
  background-color: var(--input-bg) !important;
}

.monaco-editor-container :deep(.monaco-editor .margin) {
  background-color: var(--input-bg) !important;
}

.monaco-editor-container :deep(.monaco-editor .lines-content) {
  background-color: var(--input-bg) !important;
}

.monaco-editor-container :deep(.monaco-scrollable-element > .scrollbar > .slider) {
  background: var(--scrollbar-thumb-color) !important;
}

.monaco-editor-container :deep(.monaco-scrollable-element > .scrollbar > .slider:hover) {
  background: var(--scrollbar-thumb-hover-color) !important;
}

:deep(.cm-editor) {
  height: 100%;
  width: 100%;
  background-color: var(--input-bg);
  color: var(--text-color);
}

:deep(.cm-content) {
  padding: 12px;
  color: var(--text-color);
}

:deep(.cm-scroller) {
  touch-action: auto;
  background-color: var(--input-bg);
}

/* 确保折叠和装订线适配主题 */
:deep(.cm-gutters) {
  background-color: var(--input-bg);
  border-right: 1px solid var(--border-color-light);
}

:deep(.cm-gutter) {
  background-color: var(--input-bg);
}

/* 确保搜索和替换面板适配主题 */
:deep(.cm-panel) {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

:deep(.cm-panel input) {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

:deep(.cm-panel button) {
  background-color: var(--primary-color);
  color: #fff;
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
}

:deep(.cm-panel button:hover) {
  background-color: var(--primary-hover-color);
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
