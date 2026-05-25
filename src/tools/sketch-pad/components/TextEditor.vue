<template>
  <textarea
    ref="textareaRef"
    :value="modelValue"
    :style="style"
    @input="handleInput"
    @blur="handleBlur"
    @keydown="handleKeyDown"
  ></textarea>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";

const props = defineProps<{
  modelValue: string;
  style: Record<string, string>;
  /** 是否自适应宽度（autoSize 文本模式） */
  autoWidth?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "blur"): void;
  (e: "submit"): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

/** 根据内容自动调整 textarea 尺寸 */
function autoResize() {
  const el = textareaRef.value;
  if (!el) return;

  // 高度自适应：先重置再取 scrollHeight
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;

  // 宽度自适应（仅 autoWidth 模式）
  if (props.autoWidth) {
    el.style.width = "auto";
    el.style.width = `${el.scrollWidth}px`;
  }
}

onMounted(() => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus();
      // 将光标移动到文本末尾
      textareaRef.value.setSelectionRange(props.modelValue.length, props.modelValue.length);
      // 初始化时调整高度（编辑已有多行文本的场景）
      autoResize();
    }
  });
});

function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit("update:modelValue", target.value);
  // 输入时自动撑开高度
  nextTick(autoResize);
}

function handleBlur() {
  emit("blur");
}

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl + Enter 提交编辑
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    emit("submit");
  }
  // Escape 取消或提交
  if (e.key === "Escape") {
    e.preventDefault();
    emit("submit");
  }
}
</script>
