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

<template>
  <div
    ref="barRef"
    class="directory-bar"
    :class="{ 'is-dragover': isDraggingOver }"
  >
    <div class="directory-bar__input-wrapper">
      <FolderOpen :size="16" class="directory-bar__icon" />
      <input
        v-model="modelValue"
        type="text"
        class="directory-bar__input"
        placeholder="输入或拖放目录路径..."
        @keydown="onDirKeydown"
      />
    </div>
    <el-dropdown
      trigger="click"
      popper-class="directory-bar__popper"
      @command="handleHistoryCommand"
    >
      <div>
        <el-tooltip content="历史目录" :show-after="500">
          <button class="directory-bar__btn">
            <History :size="16" />
          </button>
        </el-tooltip>
      </div>
      <template #dropdown>
        <el-dropdown-menu class="directory-bar__history-menu">
          <div class="directory-bar__history-title">历史目录</div>
          <el-dropdown-item
            v-for="(path, index) in directoryHistory"
            :key="index"
            :command="path"
            class="directory-bar__history-item"
          >
            <span class="directory-bar__history-text" :title="path">{{
              path
            }}</span>
          </el-dropdown-item>
          <el-dropdown-item v-if="directoryHistory.length === 0" disabled>
            <span class="directory-bar__history-empty">暂无历史记录</span>
          </el-dropdown-item>
          <el-dropdown-item
            v-if="directoryHistory.length > 0"
            divided
            command="clear"
            class="directory-bar__history-clear"
          >
            <Trash2 :size="14" class="directory-bar__clear-icon" />
            <span>清空历史</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

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
import { FolderOpen, FolderSearch, History, Trash2 } from "lucide-vue-next";
import { useFileDrop } from "@/composables/useFileDrop";
import {
  useInputHistory,
  useAutoSaveHistory,
} from "../composables/useInputHistory";
import { useDirSearchUiState } from "../composables/useDirSearchUiState";

const modelValue = defineModel<string>({ required: true });

const emit = defineEmits<{
  search: [];
}>();

const barRef = ref<HTMLElement>();

// 历史记录集成
const uiState = useDirSearchUiState();
const { directoryHistory } = uiState;

// 1. 键盘回溯
const { onKeydown: onDirHistoryKeydown } = useInputHistory(
  directoryHistory,
  modelValue
);

// 2. 自动保存
useAutoSaveHistory(directoryHistory, modelValue, { maxLength: 10 });

function handleHistoryCommand(command: string) {
  if (command === "clear") {
    directoryHistory.value = [];
  } else {
    modelValue.value = command;
  }
}

function onDirKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    emit("search");
    return;
  }
  // 历史记录导航
  onDirHistoryKeydown(e);
}

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
  transition: border-color 0.2s;
}

.directory-bar.is-dragover {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
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
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}
</style>

<style>
.directory-bar__popper.el-popper {
  background-color: var(--card-bg) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
  border: var(--border-width) solid var(--border-color) !important;
  box-shadow: var(--el-box-shadow-light) !important;
}

.directory-bar__popper .el-dropdown-menu {
  background-color: transparent !important;
  padding: 0 !important;
}

.directory-bar__popper .directory-bar__history-menu {
  max-width: 400px;
  min-width: 200px;
}

.directory-bar__popper .directory-bar__history-title {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
}

.directory-bar__popper .directory-bar__history-item {
  display: flex;
  align-items: center;
  padding: 8px 16px !important;
}

.directory-bar__popper .directory-bar__history-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.directory-bar__popper .directory-bar__history-empty {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  padding: 12px 16px;
  display: block;
  text-align: center;
}

.directory-bar__popper .directory-bar__history-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--el-color-danger) !important;
  padding: 8px 16px !important;
}

.directory-bar__popper .directory-bar__history-clear:hover {
  background-color: rgba(var(--el-color-danger-rgb), 0.1) !important;
}

.directory-bar__popper .directory-bar__clear-icon {
  flex-shrink: 0;
}
</style>
