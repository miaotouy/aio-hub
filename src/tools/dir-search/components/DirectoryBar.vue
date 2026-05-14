<template>
  <div ref="barRef" class="directory-bar" :class="{ 'is-dragover': isDraggingOver }">
    <div class="directory-bar__input-wrapper">
      <FolderOpen :size="16" class="directory-bar__icon" />
      <input
        v-model="modelValue"
        type="text"
        class="directory-bar__input"
        placeholder="输入或拖放目录路径..."
        @keydown.ctrl.enter="$emit('search')"
      />
    </div>
    <el-tooltip content="选择目录" :show-after="500">
      <button class="directory-bar__btn" @click="selectDirectory">
        <FolderSearch :size="16" />
      </button>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderSearch } from "lucide-vue-next";
import { useFileDrop } from "@/composables/useFileDrop";

const modelValue = defineModel<string>({ required: true });

defineEmits<{
  search: [];
}>();

const barRef = ref<HTMLElement>();

const { isDraggingOver } = useFileDrop({
  element: barRef,
  multiple: false,
  directoryOnly: true,
  onDrop: (paths) => {
    if (paths.length > 0) {
      modelValue.value = paths[0];
    }
  },
});

async function selectDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择搜索目录",
  });
  if (selected) {
    modelValue.value = selected as string;
  }
}
</script>

<style scoped>
.directory-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition: border-color 0.2s;
}

.directory-bar.is-dragover {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  box-shadow: inset 0 0 0 1px var(--el-color-primary);
}

.directory-bar__input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.directory-bar__input-wrapper:focus-within {
  border-color: var(--el-color-primary);
}

.directory-bar__icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.directory-bar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-family: var(--el-font-family);
  line-height: 1.5;
}

.directory-bar__input::placeholder {
  color: var(--el-text-color-placeholder);
}

.directory-bar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.directory-bar__btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}
</style>
