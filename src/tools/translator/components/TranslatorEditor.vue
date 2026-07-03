<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { ref, watch, onMounted, shallowRef, nextTick } from "vue";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { vscodeLight, vscodeDark } from "@uiw/codemirror-theme-vscode";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  highlightSelectionMatches,
  searchKeymap,
  search,
} from "@codemirror/search";
import { useTheme } from "@/composables/useTheme";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("translator/editor");

interface Props {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  /** 是否启用顶部搜索面板（默认启用） */
  showSearch?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  value: "",
  placeholder: "粘贴要翻译的文本，Ctrl+Enter 翻译，Ctrl+F 搜索",
  disabled: false,
  showSearch: true,
});

const emit = defineEmits<{
  (e: "update:value", val: string): void;
  (e: "submit"): void;
  (e: "blur"): void;
  (e: "focus"): void;
}>();

const editorContainer = ref<HTMLElement>();
const view = shallowRef<EditorView>();

// 防止外部 props 同步触发的 docChanged 回流，导致用户正在打字的内容被回写
let isSyncingFromProps = false;
let isComposing = false;
let lastEmittedValue = props.value;

const editableConf = new Compartment();
const themeConf = new Compartment();
const placeholderConf = new Compartment();
const { isDark } = useTheme();

// CodeMirror 搜索面板汉化
const zhCnPhrases: Record<string, string> = {
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
  "next match": "下一个匹配",
  "Next match": "下一个匹配",
  "previous match": "上一个匹配",
  "Previous match": "上一个匹配",
};

const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    fontSize: "14px",
    backgroundColor: "transparent !important",
    fontFamily: "var(--el-font-family)",
  },
  "&.cm-editor": {
    fontFamily: "var(--el-font-family)",
  },
  ".cm-scroller": {
    fontFamily: "var(--el-font-family)",
    overflow: "auto",
    backgroundColor: "transparent !important",
  },
  ".cm-content": {
    padding: "12px 14px",
    fontFamily: "var(--el-font-family)",
    lineHeight: "1.7",
    color: "var(--text-color)",
    caretColor: "var(--text-color)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-color)",
  },
  ".cm-placeholder": {
    color: "var(--text-color-light)",
    fontStyle: "normal",
    fontFamily: "var(--el-font-family)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-gutters": {
    display: "none",
  },
});

onMounted(() => {
  if (!editorContainer.value) return;

  const extensions = [
    EditorState.phrases.of(zhCnPhrases),
    Prec.highest(
      keymap.of([
        {
          // 跨平台 Ctrl+Enter / Cmd+Enter 触发翻译
          key: "Mod-Enter",
          run: () => {
            emit("submit");
            return true;
          },
        },
      ])
    ),
    history(),
    editableConf.of(EditorView.editable.of(!props.disabled)),
    themeConf.of(isDark.value ? vscodeDark : vscodeLight),
    highlightSelectionMatches(),
    ...(props.showSearch ? [search({ top: true })] : []),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    markdown(),
    placeholderConf.of(cmPlaceholder(props.placeholder || "")),
    baseTheme,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        if (isSyncingFromProps || isComposing) return;
        const newDoc = update.state.doc.toString();
        lastEmittedValue = newDoc;
        emit("update:value", newDoc);
      }
    }),
    EditorView.domEventHandlers({
      compositionstart: () => {
        isComposing = true;
        return false;
      },
      compositionend: () => {
        isComposing = false;
        nextTick(() => {
          if (!view.value) return;
          const currentDoc = view.value.state.doc.toString();
          if (currentDoc !== lastEmittedValue) {
            lastEmittedValue = currentDoc;
            emit("update:value", currentDoc);
          }
        });
        return false;
      },
      keydown: (event) => {
        // 阻止编辑器内的 Ctrl+F 冒泡到外层全局搜索
        if (
          (event.ctrlKey || event.metaKey) &&
          (event.key === "f" || event.key === "h")
        ) {
          event.stopPropagation();
        }
        return false;
      },
      blur: () => {
        emit("blur");
        return false;
      },
      focus: () => {
        emit("focus");
        return false;
      },
    }),
  ];

  const state = EditorState.create({
    doc: props.value,
    extensions,
  });

  try {
    view.value = new EditorView({
      state,
      parent: editorContainer.value,
    });
  } catch (error) {
    logger.error("CodeMirror 初始化失败", error as Error);
  }
});

// 外部 value 变化 → 同步到编辑器
watch(
  () => props.value,
  (newVal) => {
    if (!view.value) return;
    if (isComposing || newVal === lastEmittedValue) return;
    const currentDoc = view.value.state.doc.toString();
    if (newVal === currentDoc) return;
    isSyncingFromProps = true;
    try {
      view.value.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: newVal },
      });
      lastEmittedValue = newVal;
    } finally {
      nextTick(() => {
        isSyncingFromProps = false;
      });
    }
  },
  { flush: "sync" }
);

watch(
  () => props.disabled,
  (disabled) => {
    view.value?.dispatch({
      effects: editableConf.reconfigure(EditorView.editable.of(!disabled)),
    });
  }
);

watch(isDark, (dark) => {
  view.value?.dispatch({
    effects: themeConf.reconfigure(dark ? vscodeDark : vscodeLight),
  });
});

watch(
  () => props.placeholder,
  (placeholder) => {
    view.value?.dispatch({
      effects: placeholderConf.reconfigure(cmPlaceholder(placeholder || "")),
    });
  }
);

defineExpose({
  focus: () => view.value?.focus(),
  getValue: () => view.value?.state.doc.toString() ?? "",
  insertText: (text: string) => {
    if (!view.value) return;
    const { from, to } = view.value.state.selection.main;
    view.value.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    });
    emit("update:value", view.value.state.doc.toString());
  },
});
</script>

<template>
  <div
    ref="editorContainer"
    class="translator-cm-editor"
    :class="{ disabled }"
  ></div>
</template>

<style scoped>
.translator-cm-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
  cursor: text;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.translator-cm-editor.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

:deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

:deep(.cm-scroller) {
  overflow: auto !important;
}

/* 搜索面板适配主题 */
:deep(.cm-panels) {
  border-top: var(--border-width) solid var(--border-color);
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  z-index: 10;
}

:deep(.cm-panel.cm-search) {
  padding: 6px 10px;
  color: var(--text-color);
  background: transparent;
  border: none;
}

:deep(.cm-panel input.cm-textfield) {
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  box-shadow: none;
  appearance: none;
  transition: border-color 0.2s;
}

:deep(.cm-panel input.cm-textfield:focus) {
  border-color: var(--primary-color);
}

:deep(.cm-panel label) {
  font-size: 12px;
  color: var(--text-color-light);
  cursor: pointer;
}

:deep(.cm-panel button.cm-button) {
  background-color: var(--card-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  background-image: none;
  box-shadow: none;
  transition: all 0.2s;
}

:deep(.cm-panel button.cm-button:hover) {
  background-color: var(--el-fill-color-light);
  border-color: var(--primary-color);
}

:deep(.cm-panel [name="close"]) {
  color: var(--text-color-light);
  cursor: pointer;
  border-radius: 4px;
  border: none;
  background: transparent;
  box-shadow: none;
  background-image: none;
  transition: all 0.2s;
}

:deep(.cm-panel [name="close"]:hover) {
  background-color: color-mix(in srgb, var(--error-color) 15%, transparent);
  color: var(--error-color);
}
</style>
