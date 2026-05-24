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
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "blur"): void;
  (e: "submit"): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

onMounted(() => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus();
      // 将光标移动到文本末尾
      textareaRef.value.setSelectionRange(props.modelValue.length, props.modelValue.length);
    }
  });
});

function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit("update:modelValue", target.value);
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
