<script setup lang="ts">
import { ref, watch, onMounted, shallowRef } from "vue";
import { EditorView, keymap, tooltips, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { useTheme } from "@/composables/useTheme";
import { markdown } from "@codemirror/lang-markdown";
import { vscodeLight, vscodeDark } from "@uiw/codemirror-theme-vscode";
import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { MacroRegistry, initializeMacroEngine, type MacroDefinition } from "../../macro-engine";

interface Props {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  height?: string | number;
  maxHeight?: string | number;
}

const props = withDefaults(defineProps<Props>(), {
  value: "",
  placeholder: "输入消息...",
  disabled: false,
  height: "auto",
  maxHeight: "70vh",
});

const emit = defineEmits<{
  (e: "update:value", val: string): void;
  (e: "submit"): void;
  (e: "keydown", event: KeyboardEvent): void;
  (e: "paste", event: ClipboardEvent): void;
}>();

const editorContainer = ref<HTMLElement>();
const view = shallowRef<EditorView>();
const editableConf = new Compartment();
const themeConf = new Compartment();
const { isDark } = useTheme();

// 宏补全源
const macroCompletionSource = (context: CompletionContext): CompletionResult | null => {
  // 获取当前行光标前的文本
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 匹配以 {{ 开头的宏前缀，支持字母、数字、下划线和冒号
  const match = textBefore.match(/\{\{([a-zA-Z0-9_:]*)$/);
  if (!match) return null;

  const prefix = match[1].toLowerCase();
  const startPos = context.pos - match[1].length;

  const registry = MacroRegistry.getInstance();
  const macros = registry.getAllMacros();

  const options: Completion[] = (macros as MacroDefinition[])
    .filter((m) => m.supported !== false)
    .filter(
      (m) => m.name.toLowerCase().includes(prefix) || m.description.toLowerCase().includes(prefix)
    )
    .map((m) => ({
      label: m.name,
      type: "variable",
      detail: m.description,
      info: m.example ? `示例: ${m.example}` : undefined,
      apply: (view: EditorView, completion: Completion, from: number, to: number) => {
        // 插入完整的宏格式 {{name}}，注意此时 from 是前缀开始的位置
        // 我们需要把前面的 {{ 也替换掉
        const wordStart = from - 2; // 减去 {{ 的长度
        const insertText = `{{${completion.label}}}`;
        view.dispatch({
          changes: { from: wordStart, to: to, insert: insertText },
          selection: { anchor: wordStart + insertText.length },
        });
      },
    }));

  if (options.length === 0) return null;

  return {
    from: startPos,
    options,
    filter: false, // 我们已经手动过滤过了
  };
};

// 基础样式扩展
const baseTheme = EditorView.theme({
  "&": {
    height: "auto",
    minHeight: "40px",
    fontSize: "14px",
    backgroundColor: "transparent !important",
    fontFamily: "inherit", // 顶层继承
  },
  "&.cm-editor": {
    fontFamily: "inherit",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    overflow: "auto",
    backgroundColor: "transparent !important",
  },
  ".cm-content": {
    padding: "10px 14px",
    fontFamily: "inherit",
    lineHeight: "1.6",
    color: "var(--text-color)",
    caretColor: "var(--text-color)", // 确保原生光标颜色也跟随文字
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-color)",
  },
  ".cm-placeholder": {
    color: "var(--text-color-light)",
    fontStyle: "normal",
  },
  "&.cm-focused": {
    outline: "none",
  },
  // 隐藏 gutter
  ".cm-gutters": {
    display: "none",
  },
  // 补全弹窗样式适配
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--container-bg)",
    border: "1px solid var(--border-color)",
    borderRadius: "8px",
    boxShadow: "var(--el-box-shadow-light)",
    backdropFilter: "blur(var(--ui-blur))",
  },
  ".cm-completionLabel": {
    color: "var(--text-color)",
  },
  ".cm-completionMatched": {
    color: "var(--primary-color)",
    textDecoration: "none",
    fontWeight: "bold",
  },
  ".cm-completionDetail": {
    color: "var(--text-color-secondary)",
    fontSize: "12px",
    marginLeft: "8px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--el-fill-color-light)",
    color: "var(--primary-color)",
  },
});
onMounted(() => {
  if (!editorContainer.value) return;

  // 确保宏引擎已初始化
  const registry = MacroRegistry.getInstance();
  if (registry.getAllMacros().length === 0) {
    initializeMacroEngine();
  }

  const state = EditorState.create({
    doc: props.value,
    extensions: [
      history(),
      editableConf.of(EditorView.editable.of(!props.disabled)),
      themeConf.of(isDark.value ? vscodeDark : vscodeLight),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      autocompletion({
        override: [macroCompletionSource],
        icons: false, // 暂时关闭图标以保持简洁
      }),
      tooltips({
        parent: document.body,
      }),
      cmPlaceholder(props.placeholder),
      baseTheme,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit("update:value", update.state.doc.toString());
        }
      }),
      // 监听原始键盘事件
      EditorView.domEventHandlers({
        keydown: (event) => {
          emit("keydown", event);
          return false;
        },
        paste: (event) => {
          emit("paste", event);
          return false;
        },
      }),
    ],
  });

  view.value = new EditorView({
    state,
    parent: editorContainer.value,
  });
});

// 监听外部值变化
watch(
  () => props.value,
  (newVal) => {
    if (view.value && newVal !== view.value.state.doc.toString()) {
      view.value.dispatch({
        changes: { from: 0, to: view.value.state.doc.length, insert: newVal },
      });
    }
  }
);

// 监听禁用状态
watch(
  () => props.disabled,
  (disabled) => {
    if (view.value) {
      view.value.dispatch({
        effects: editableConf.reconfigure(EditorView.editable.of(!disabled)),
      });
    }
  }
);

// 监听主题变化
watch(isDark, (dark) => {
  if (view.value) {
    view.value.dispatch({
      effects: themeConf.reconfigure(dark ? vscodeDark : vscodeLight),
    });
  }
});

// 暴露方法给父组件
defineExpose({
  focus: () => view.value?.focus(),
  // 模拟 textarea 的 setSelectionRange
  setSelectionRange: (start: number, end: number) => {
    view.value?.dispatch({
      selection: { anchor: start, head: end },
      scrollIntoView: true,
    });
  },
  getSelectionRange: () => {
    if (!view.value) return { start: 0, end: 0 };
    const { from, to } = view.value.state.selection.main;
    return { start: from, end: to };
  },
  insertText: (text: string, from?: number, to?: number) => {
    if (!view.value) return;
    const range = view.value.state.selection.main;
    const insertFrom = from ?? range.from;
    const insertTo = to ?? range.to;
    view.value.dispatch({
      changes: { from: insertFrom, to: insertTo, insert: text },
      selection: { anchor: insertFrom + text.length },
      scrollIntoView: true,
    });
  },
});
</script>

<template>
  <div
    ref="editorContainer"
    class="chat-cm-editor"
    :class="{ disabled }"
    :style="{
      height: typeof height === 'number' ? height + 'px' : height,
      maxHeight: typeof maxHeight === 'number' ? maxHeight + 'px' : maxHeight,
    }"
  ></div>
</template>

<style>
/* 全局样式，用于处理挂载到 body 的补全弹窗 */
.cm-tooltip.cm-tooltip-autocomplete {
  background-color: var(--container-bg) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  box-shadow: var(--el-box-shadow-light) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
  overflow: hidden !important;
}

.cm-tooltip-autocomplete ul {
  font-family: inherit !important;
}

.cm-tooltip-autocomplete ul li {
  padding: 4px 8px !important;
}

.cm-tooltip-autocomplete ul li[aria-selected] {
  background-color: var(--el-fill-color-light) !important;
  color: var(--primary-color) !important;
}

.cm-completionLabel {
  color: var(--text-color) !important;
}

.cm-completionMatched {
  color: var(--primary-color) !important;
  text-decoration: none !important;
  font-weight: bold !important;
}

.cm-completionDetail {
  color: var(--text-color-secondary) !important;
  font-size: 12px !important;
  margin-left: 8px !important;
}
</style>

<style scoped>
.chat-cm-editor {
  width: 100%;
  min-height: 40px;
  cursor: text;
}

.chat-cm-editor.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:deep(.cm-editor) {
  height: 100%;
}

:deep(.cm-scroller) {
  height: 100% !important;
  max-height: inherit !important;
}
</style>
