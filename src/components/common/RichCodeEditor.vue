<template>
  <div class="rich-code-editor-wrapper" ref="wrapperRef">
    <!-- Monaco Diff Editor -->
    <vue-monaco-diff-editor
      v-if="props.diff"
      :original="props.original"
      :modified="props.modified"
      :language="getMonacoLanguage()"
      :options="monacoDiffOptions"
      :theme="monacoTheme"
      class="monaco-editor-container"
      @mount="handleMonacoDiffMount"
      @update:original="(value: string) => emit('update:original', value)"
      @update:modified="(value: string) => emit('update:modified', value)"
    />
    <!-- CodeMirror 编辑器 -->
    <div
      v-else-if="props.editorType === 'codemirror'"
      ref="editorContainerRef"
      class="editor-container"
    ></div>
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
import { ref, onMounted, onUnmounted, watch, shallowRef, computed, nextTick } from "vue";
import { useTheme } from "@composables/useTheme";
import { VueMonacoEditor, VueMonacoDiffEditor } from "@guolao/vue-monaco-editor";
import type { editor as MonacoEditor } from "monaco-editor";
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
import { highlightSelectionMatches, searchKeymap, search } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { vscodeLight, vscodeDark } from "@uiw/codemirror-theme-vscode";
import { getMonacoLanguageId, getCodeMirrorLanguage } from "@/utils/codeLanguages";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    original?: string;
    modified?: string;
    diff?: boolean;
    language?: string;
    readOnly?: boolean;
    lineNumbers?: boolean;
    editorType?: "codemirror" | "monaco";
    options?:
      | MonacoEditor.IStandaloneDiffEditorConstructionOptions
      | MonacoEditor.IStandaloneEditorConstructionOptions;
    /** 自定义补全源（仅 CodeMirror 支持） */
    completionSource?: CompletionSource | CompletionSource[];
    /** 是否禁用默认的语言补全（如 HTML 标签补全） */
    disableDefaultCompletion?: boolean;
  }>(),
  {
    modelValue: "",
    original: "",
    modified: "",
    diff: false,
    editorType: "codemirror",
    lineNumbers: true,
    readOnly: false,
    options: () => ({}),
    disableDefaultCompletion: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:original", value: string): void;
  (e: "update:modified", value: string): void;
  (
    e: "mount",
    editor: MonacoEditor.IStandaloneCodeEditor | EditorView | MonacoEditor.IStandaloneDiffEditor
  ): void;
}>();

const editorContainerRef = ref<HTMLDivElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const editableCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const foldGutterCompartment = new Compartment();
const historyCompartment = new Compartment();
const themeCompartment = new Compartment();
const languageCompartment = new Compartment();
const wrapperRef = ref<HTMLDivElement | null>(null);

// CodeMirror 本地化词条
const zhCnPhrases = {
  // @codemirror/view
  "Control character": "控制字符",
  // @codemirror/commands
  "Selection deleted": "选择已删除",
  // @codemirror/language
  "Fold line": "折叠行",
  "Unfold line": "展开行",
  fold: "折叠",
  unfold: "展开",
  "Fold all": "全部折叠",
  "Unfold all": "全部展开",
  // @codemirror/search
  Find: "查找",
  find: "查找",
  Replace: "替换",
  replace: "替换",
  next: "下一个",
  Next: "下一个",
  previous: "上一个",
  Previous: "上一个",
  all: "全部",
  All: "全部",
  "match case": "区分大小写",
  "Match case": "区分大小写",
  "by word": "全字匹配",
  "By word": "全字匹配",
  regexp: "正则表达式",
  Regexp: "正则表达式",
  "regular expression": "正则表达式",
  "Regular expression": "正则表达式",
  "replace all": "全部替换",
  "Replace all": "全部替换",
  "replace with": "替换为",
  "Replace with": "替换为",
  close: "关闭",
  Close: "关闭",
  "select all": "全选",
  "Select all": "全选",
  "next match": "下一个匹配",
  "Next match": "下一个匹配",
  "previous match": "上一个匹配",
  "Previous match": "上一个匹配",
  "Pick a completion": "选择补全",
  // @codemirror/autocomplete
  Completions: "补全",
  completions: "补全",
  // @codemirror/lint
  Diagnostics: "诊断",
  "No diagnostics": "无诊断信息",
};

// Monaco Editor 相关状态
const monacoEditorInstance = shallowRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
const monacoDiffEditorInstance = shallowRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
const monacoValue = ref(props.modelValue);

// Monaco Editor 配置
const monacoOptions = computed<MonacoEditor.IStandaloneEditorConstructionOptions>(() => ({
  readOnly: props.readOnly ?? false,
  lineNumbers: (props.lineNumbers ?? true) ? "on" : "off",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
  wordWrap: "on",
  automaticLayout: true,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  renderLineHighlight: "all",
  folding: true,
  foldingStrategy: "indentation",
  showFoldingControls: "always",
  ...(props.options as MonacoEditor.IStandaloneEditorConstructionOptions),
}));

// Monaco Diff Editor 配置
const monacoDiffOptions = computed<MonacoEditor.IStandaloneDiffEditorConstructionOptions>(() => ({
  readOnly: props.readOnly ?? false,
  lineNumbers: (props.lineNumbers ?? true) ? "on" : "off",
  automaticLayout: true,
  fontSize: 14,
  scrollBeyondLastLine: false,
  ...(props.options as MonacoEditor.IStandaloneDiffEditorConstructionOptions),
}));
// Monaco 语言映射
const getMonacoLanguage = () => {
  return getMonacoLanguageId(props.language);
};

// Monaco Editor 事件处理
const handleMonacoMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
  monacoEditorInstance.value = editor;
  // 确保挂载时设置最新的值，解决初始加载时内容为空的问题
  if (props.modelValue && editor.getValue() !== props.modelValue) {
    editor.setValue(props.modelValue);
  }
  emit("mount", editor);
};

const handleMonacoDiffMount = (editor: MonacoEditor.IStandaloneDiffEditor) => {
  monacoDiffEditorInstance.value = editor;
  emit("mount", editor);
};

const handleMonacoFocus = () => {
  wrapperRef.value?.classList.add("is-focused");
};

const handleMonacoBlur = () => {
  wrapperRef.value?.classList.remove("is-focused");
};

// 主题切换
const { isDark } = useTheme();
const cmTheme = computed(() => (isDark.value ? vscodeDark : vscodeLight));
const monacoTheme = computed(() => (isDark.value ? "vs-dark" : "vs"));

// CodeMirror 初始化和销毁
const initCodeMirror = async () => {
  if (!editorContainerRef.value) return;

  // 如果已有实例，先销毁
  destroyCodeMirror();

  const extensions = [
    EditorState.phrases.of(zhCnPhrases),
    themeCompartment.of(cmTheme.value),
    // 基础主题 - 完全适配全局 CSS 变量
    EditorView.theme({
      "&": {
        color: "var(--text-color)",
        backgroundColor: "var(--input-bg) !important",
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
        backgroundColor: "var(--input-bg) !important",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
        color: "var(--text-color)",
        backgroundColor: "transparent !important",
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
    lineNumbersCompartment.of((props.lineNumbers ?? true) ? lineNumbers() : []),
    foldGutterCompartment.of(foldGutter()),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    historyCompartment.of(history()),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
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
    // 配置自动补全
    autocompletion({
      // 如果提供了自定义补全源，使用 override 来控制补全行为
      override: props.completionSource
        ? Array.isArray(props.completionSource)
          ? props.completionSource
          : [props.completionSource]
        : props.disableDefaultCompletion
          ? []
          : undefined,
    }),
    EditorView.lineWrapping,
    languageCompartment.of([]),
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
      contextmenu(_event, _view) {
        // 如果有选中文本，可以在这里处理
        // 目前为了解决“搜索出不来”的问题，我们允许默认右键，
        // 但如果姐姐希望右键能触发搜索，可以取消注释下面代码
        // _event.preventDefault();
        // openSearchPanel(_view);
      },
    }),
  ];

  const startState = EditorState.create({
    doc: props.modelValue,
    extensions,
  });

  const view = new EditorView({
    state: startState,
    parent: editorContainerRef.value,
  });

  editorView.value = view;

  // 初始化语言
  if (props.language) {
    const languageExt = await getCodeMirrorLanguage(props.language);
    if (languageExt) {
      view.dispatch({
        effects: languageCompartment.reconfigure(languageExt),
      });
    }
  }
};

const destroyCodeMirror = () => {
  if (editorView.value) {
    editorView.value.destroy();
    editorView.value = null;
  }
};

// 监听 Monaco 值变化并同步到父组件
watch(monacoValue, (newVal) => {
  if (!props.diff && props.editorType === "monaco" && newVal !== props.modelValue) {
    emit("update:modelValue", newVal);
  }
});

onMounted(async () => {
  if (!props.diff && props.editorType === "codemirror") {
    await initCodeMirror();
  }
});

onUnmounted(() => {
  destroyCodeMirror();
  // Monaco 编辑器由组件库自动处理销毁
});

// 监听 modelValue 变化 (双向绑定)
watch(
  () => props.modelValue,
  (newVal) => {
    if (props.diff) return;
    if (props.editorType === "codemirror") {
      if (editorView.value && newVal !== editorView.value.state.doc.toString()) {
        editorView.value.dispatch({
          changes: { from: 0, to: editorView.value.state.doc.length, insert: newVal },
        });
      }
    } else if (props.editorType === "monaco") {
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
    if (props.diff) return;
    if (props.editorType === "codemirror" && editorView.value) {
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
    if (props.diff) return;
    if (props.editorType === "codemirror" && editorView.value) {
      editorView.value.dispatch({
        effects: lineNumbersCompartment.reconfigure((show ?? true) ? lineNumbers() : []),
      });
    }
    // Monaco 通过 computed options 自动响应
  }
);

// 监听编辑器类型切换
watch(
  () => props.editorType,
  (newType, oldType) => {
    if (props.diff) return;
    if (newType === "codemirror" && oldType === "monaco") {
      nextTick(async () => {
        await initCodeMirror();
      });
    } else if (newType === "monaco" && oldType === "codemirror") {
      destroyCodeMirror();
    }
  }
);

watch(cmTheme, (newTheme) => {
  if (!props.diff && props.editorType === "codemirror" && editorView.value) {
    editorView.value.dispatch({
      effects: themeCompartment.reconfigure(newTheme),
    });
  }
});

watch(
  () => props.language,
  async (newLang) => {
    if (!props.diff && props.editorType === "codemirror" && editorView.value) {
      const languageExt = await getCodeMirrorLanguage(newLang);
      editorView.value.dispatch({
        effects: languageCompartment.reconfigure(languageExt || []),
      });
    }
  }
);

// 暴露一些有用的方法（统一 CodeMirror 和 Monaco 的 API）
const getContent = (): string => {
  if (props.editorType === "codemirror") {
    return editorView.value?.state.doc.toString() || "";
  } else {
    return monacoEditorInstance.value?.getValue() || "";
  }
};

const setContent = (newContent: string): void => {
  if (props.diff) {
    console.warn(
      "`setContent` is not supported in diff mode. Use `original` and `modified` props."
    );
    return;
  }
  if (props.editorType === "codemirror") {
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
  if (props.editorType === "codemirror") {
    editorView.value?.focus();
  } else {
    monacoEditorInstance.value?.focus();
  }
};

/**
 * 清除编辑器历史记录（撤销栈）
 */
const clearHistory = (): void => {
  if (props.editorType === "codemirror") {
    if (editorView.value) {
      editorView.value.dispatch({
        effects: historyCompartment.reconfigure([]),
      });
      editorView.value.dispatch({
        effects: historyCompartment.reconfigure(history()),
      });
    }
  } else {
    if (monacoEditorInstance.value) {
      const model = monacoEditorInstance.value.getModel();
      if (model) {
        // Monaco setValue 默认会重置撤销栈，但为了保险，
        // 我们通过重新设置一遍值来强制重置
        model.setValue(model.getValue());
      }
    }
  }
};

defineExpose({
  getContent,
  setContent,
  focusEditor,
  clearHistory,
  editorView,
  monacoEditorInstance,
  monacoDiffEditorInstance,
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
  overflow: hidden;
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

/* 适配主题外观：使 Monaco 编辑器背景透明，使用经过颜色混合处理的背景变量 */
:deep(.monaco-editor) {
  /*
    Monaco 的主题会注入一个 .monaco-editor 选择器来覆盖 --vscode-editor-background 变量。
    我们需要用 Vue 的 scoped style 生成的更高优先级的选择器 ([data-v-xxxx]) 来覆盖回去。
    这里我们不能直接使用 var(--vscode-editor-background)，因为它已经被污染了。
    我们根据 useThemeAppearance 的逻辑重新构建正确的背景色，并使用 --code-block-bg 变量来同步设置。
  */
  --vscode-editor-background: var(--code-block-bg, var(--input-bg)) !important;
  --vscode-editorGutter-background: var(--code-block-bg, var(--input-bg)) !important;
  --vscode-editorStickyScrollGutter-background: var(--code-block-bg, var(--card-bg)) !important;
  --vscode-editorStickyScroll-background: var(--code-block-bg, var(--card-bg)) !important;
  --vscode-editorStickyScroll-shadow: var(--code-block-bg, var(--card-bg)) !important;
}

:deep(.monaco-editor .monaco-editor-background),
:deep(.monaco-editor .overflow-guard),
:deep(.monaco-editor .lines-content) {
  background-color: var(--vscode-editor-background) !important;
}

:deep(.monaco-editor .margin) {
  background-color: var(--vscode-editorGutter-background) !important;
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
/* 搜索面板适配 - 纯配色适配，不干扰布局 */
:deep(.cm-panels) {
  border-top: 1px solid var(--border-color);
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
  z-index: 10;
}

:deep(.cm-panel.cm-search) {
  padding: 8px 12px;
  color: var(--text-color);
  background: transparent;
  border: none;
}

/* 输入框适配 */
:deep(.cm-panel input.cm-textfield) {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  padding: 4px 8px;
  outline: none;
  transition: border-color 0.2s;
  /* 清除原生阴影和渐变 */
  box-shadow: none;
  appearance: none;
}

:deep(.cm-panel input.cm-textfield:focus) {
  border-color: var(--primary-color);
}

/* 复选框适配 */
:deep(.cm-panel label) {
  font-size: 13px;
  color: var(--text-color-light);
  cursor: pointer;
}

:deep(.cm-panel label:hover) {
  color: var(--text-color);
}

/* 按钮适配 */
:deep(.cm-panel button.cm-button) {
  background-color: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(var(--ui-blur));
  /* 清除按钮默认渐变和阴影 */
  background-image: none;
  box-shadow: none;
}

:deep(.cm-panel button.cm-button:hover) {
  background-color: var(--el-fill-color-light);
  border-color: var(--primary-color);
}

:deep(.cm-panel button[name="next"]:hover),
:deep(.cm-panel button[name="prev"]:hover),
:deep(.cm-panel button[name="replace"]:hover),
:deep(.cm-panel button[name="replaceAll"]:hover),
:deep(.cm-panel button[name="select"]:hover) {
  background-color: color-mix(in srgb, var(--primary-color) 15%, transparent);
  color: var(--primary-color);
  border-color: var(--primary-color);
}

:deep(.cm-panel button[name="next"]:active),
:deep(.cm-panel button[name="prev"]:active),
:deep(.cm-panel button[name="replace"]:active),
:deep(.cm-panel button[name="replaceAll"]:active),
:deep(.cm-panel button[name="select"]:active) {
  background-color: color-mix(in srgb, var(--primary-color) 25%, transparent);
}

/* 关闭按钮适配 */
:deep(.cm-panel [name="close"]) {
  color: var(--text-color-light);
  cursor: pointer;
  border-radius: 4px;
  border: none;
  background: transparent;
  transition: all 0.2s;
  font-size: 20px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  background-image: none;
  margin-left: 8px;
  flex-shrink: 0;
}

:deep(.cm-panel [name="close"]:hover) {
  background-color: color-mix(in srgb, var(--error-color) 15%, transparent);
  color: var(--error-color);
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
