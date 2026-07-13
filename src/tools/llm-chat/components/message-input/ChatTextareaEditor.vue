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
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

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
const shadowValue = computed(() => {
  if (localValue.value === "" || localValue.value.endsWith("\n")) {
    return `${localValue.value} `;
  }

  return localValue.value;
});

// ===== 撤销/重做栈 =====
interface HistoryEntry {
  value: string;
  cursorStart: number;
  cursorEnd: number;
}

const MAX_HISTORY_SIZE = 100;
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];
let isUndoRedoing = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function getCursorPos(): { start: number; end: number } {
  const el = textareaEl.value;
  if (!el) return { start: 0, end: 0 };
  return { start: el.selectionStart, end: el.selectionEnd };
}

function pushToUndoStack(entry: HistoryEntry) {
  if (isUndoRedoing) return;
  // 值未变化不入栈
  if (
    undoStack.length > 0 &&
    undoStack[undoStack.length - 1].value === entry.value
  )
    return;
  undoStack.push(entry);
  if (undoStack.length > MAX_HISTORY_SIZE) {
    undoStack.shift();
  }
  // 新变更清空重做栈
  redoStack.length = 0;
}

function commitCurrentState() {
  const { start, end } = getCursorPos();
  pushToUndoStack({
    value: localValue.value,
    cursorStart: start,
    cursorEnd: end,
  });
}

/** 刷出待提交的防抖状态 */
function flushDebouncedCommit() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    commitCurrentState();
  }
}

/** 用户输入防抖提交（400ms 合并快速连续输入为一次撤销步） */
function scheduleCommit() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    commitCurrentState();
    debounceTimer = null;
  }, 400);
}

function initHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  const { start, end } = getCursorPos();
  undoStack.push({
    value: localValue.value,
    cursorStart: start,
    cursorEnd: end,
  });
}

function handleUndo() {
  flushDebouncedCommit();
  if (undoStack.length <= 1) return; // 保留至少初始状态

  isUndoRedoing = true;
  const current = undoStack.pop()!;
  redoStack.push(current);

  const previous = undoStack[undoStack.length - 1];
  localValue.value = previous.value;

  nextTick(() => {
    const el = textareaEl.value;
    if (el) {
      el.setSelectionRange(previous.cursorStart, previous.cursorEnd);
    }
    isUndoRedoing = false;
  });
}

function handleRedo() {
  flushDebouncedCommit();
  if (redoStack.length === 0) return;

  isUndoRedoing = true;
  const next = redoStack.pop()!;
  undoStack.push(next);

  localValue.value = next.value;

  nextTick(() => {
    const el = textareaEl.value;
    if (el) {
      el.setSelectionRange(next.cursorStart, next.cursorEnd);
    }
    isUndoRedoing = false;
  });
}

// ===== End 撤销/重做栈 =====

// 从外部同步
watch(
  () => props.value,
  (newVal) => {
    if (newVal !== localValue.value) {
      flushDebouncedCommit();
      localValue.value = newVal;
      // 外部同步也入栈，保持与 CodeMirror 行为一致（发送清空后可 undo 回来）
      nextTick(() => {
        const { start, end } = getCursorPos();
        pushToUndoStack({ value: newVal, cursorStart: start, cursorEnd: end });
      });
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
  // 用户输入防抖入栈，通过 watch 同步到外部
  scheduleCommit();
};

const handleKeydown = (e: KeyboardEvent) => {
  emit("keydown", e);

  if (e.isComposing) return;

  // 拦截撤销/重做快捷键，使用自定义栈替代浏览器原生行为
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    handleUndo();
    return;
  }
  if (
    ((e.ctrlKey || e.metaKey) && e.key === "y") ||
    ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z")
  ) {
    e.preventDefault();
    handleRedo();
    return;
  }

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
  // 粘贴前先刷出待提交状态，确保粘贴前快照已入栈
  flushDebouncedCommit();
  emit("paste", e);
};

onMounted(() => {
  initHistory();
});

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});

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
    flushDebouncedCommit();
    const insertFrom = from ?? el.selectionStart;
    const insertTo = to ?? el.selectionEnd;
    const before = localValue.value.slice(0, insertFrom);
    const after = localValue.value.slice(insertTo);
    localValue.value = before + text + after;
    // 移动光标到插入后 —— 必须在 nextTick 中执行，
    // 等 Vue v-model 将新值 flush 到 DOM 后再设置光标，
    // 否则浏览器在 textarea.value 被程序化写入时会重置光标到 0
    const newPos = insertFrom + text.length;
    // 程序化变更立即入栈
    pushToUndoStack({
      value: localValue.value,
      cursorStart: newPos,
      cursorEnd: newPos,
    });
    nextTick(() => {
      el.setSelectionRange(newPos, newPos);
      el.focus();
    });
  },
  replaceRange: (text: string, from: number, to: number) => {
    const el = textareaEl.value;
    if (!el) return;
    flushDebouncedCommit();
    const before = localValue.value.slice(0, from);
    const after = localValue.value.slice(to);
    localValue.value = before + text + after;
    // 不移动光标（静默替换）
    // 程序化变更立即入栈，nextTick 后读取实际光标位
    nextTick(() => {
      const { start, end } = getCursorPos();
      pushToUndoStack({
        value: localValue.value,
        cursorStart: start,
        cursorEnd: end,
      });
    });
  },
  getValue: () => localValue.value,
  undo: handleUndo,
  redo: handleRedo,
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
    <div class="shadow-renderer" aria-hidden="true">{{ shadowValue }}</div>
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
