<script setup lang="ts">
import { ref, watch } from "vue";

interface Props {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  height?: string | number;
  maxHeight?: string | number;
  sendKey?: "ctrl+enter" | "enter";
}

const props = withDefaults(defineProps<Props>(), {
  value: "",
  placeholder: "输入消息...",
  disabled: false,
  height: "auto",
  maxHeight: "70vh",
  sendKey: "ctrl+enter",
});

const emit = defineEmits<{
  (e: "update:value", val: string): void;
  (e: "submit"): void;
  (e: "keydown", event: KeyboardEvent): void;
  (e: "paste", event: ClipboardEvent): void;
}>();

const textareaEl = ref<HTMLTextAreaElement | null>(null);
const localValue = ref(props.value);

// 从外部同步
watch(
  () => props.value,
  (newVal) => {
    if (newVal !== localValue.value) {
      localValue.value = newVal;
    }
  }
);

// 向外 emit
watch(localValue, (newVal) => {
  if (newVal !== props.value) {
    emit("update:value", newVal);
  }
});

const handleInput = () => {
  // 输入变化自动通过 watch 同步
};

const handleKeydown = (e: KeyboardEvent) => {
  emit("keydown", e);

  if (e.isComposing) return;

  if (props.sendKey === "ctrl+enter") {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      emit("submit");
    }
  } else if (props.sendKey === "enter") {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      emit("submit");
    }
  }
};

const handlePaste = (e: ClipboardEvent) => {
  emit("paste", e);
};

// 暴露接口与 ChatCodeMirrorEditor 对齐
defineExpose({
  focus: () => textareaEl.value?.focus(),
  setSelectionRange: (start: number, end: number) => {
    textareaEl.value?.setSelectionRange(start, end);
  },
  getSelectionRange: () => {
    if (!textareaEl.value) return { start: 0, end: 0 };
    return {
      start: textareaEl.value.selectionStart,
      end: textareaEl.value.selectionEnd,
    };
  },
  insertText: (text: string, from?: number, to?: number) => {
    const el = textareaEl.value;
    if (!el) return;
    const insertFrom = from ?? el.selectionStart;
    const insertTo = to ?? el.selectionEnd;
    const before = localValue.value.slice(0, insertFrom);
    const after = localValue.value.slice(insertTo);
    localValue.value = before + text + after;
    // 移动光标到插入后
    const newPos = insertFrom + text.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
  },
  replaceRange: (text: string, from: number, to: number) => {
    const el = textareaEl.value;
    if (!el) return;
    const before = localValue.value.slice(0, from);
    const after = localValue.value.slice(to);
    localValue.value = before + text + after;
    // 不移动光标（静默替换）
  },
  getValue: () => localValue.value,
});
</script>

<template>
  <div
    class="textarea-wrapper"
    :style="{
      height: typeof height === 'number' ? height + 'px' : height,
      maxHeight: typeof maxHeight === 'number' ? maxHeight + 'px' : maxHeight,
    }"
  >
    <!-- 隐藏的影子层：与 textarea 完全相同的排版参数，用于撑开容器高度 -->
    <div class="shadow-renderer" aria-hidden="true">
      {{
        localValue +
        (localValue.endsWith("\n") || localValue === "" ? "\n " : "")
      }}
    </div>
    <!-- 实际输入框 -->
    <textarea
      ref="textareaEl"
      v-model="localValue"
      class="chat-textarea-editor"
      :class="{ disabled }"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
    ></textarea>
  </div>
</template>

<style scoped>
.textarea-wrapper {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  overflow: hidden; /* 避免外层滚动，由 textarea 自身负责滚动 */
}

.shadow-renderer,
.chat-textarea-editor {
  /* 两者必须完全相同的排版参数，保证高度一致 */
  grid-area: 1 / 1;
  width: 100%;
  min-height: 40px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: var(--el-font-family);
  line-height: 1.6;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: break-word;
}

.shadow-renderer {
  visibility: hidden;
  height: auto;
  pointer-events: none;
  max-height: inherit; /* 继承 wrapper 的 max-height，防止无限撑开 grid track */
  overflow: hidden;
}

.chat-textarea-editor {
  background-color: transparent;
  border: none;
  outline: none;
  resize: none;
  color: var(--text-color);
  cursor: text;
  max-height: inherit; /* 继承 wrapper 的 max-height */
  overflow-y: auto; /* 允许 textarea 自身滚动 */
}

.chat-textarea-editor:focus {
  outline: none;
}

.chat-textarea-editor::placeholder {
  color: var(--text-color-light);
  font-style: normal;
}

.chat-textarea-editor.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
