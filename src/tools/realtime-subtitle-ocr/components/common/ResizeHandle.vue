<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except compliance with the License.
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
    class="resize-trigger-y"
    :class="{ 'is-resizing': isResizing }"
    :title="title"
    @mousedown="$emit('start', $event)"
    @dblclick="$emit('reset')"
  >
    <div class="resize-handle-line"></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    isResizing?: boolean;
    title?: string;
  }>(),
  { isResizing: false, title: "" }
);

defineEmits<{
  start: [event: MouseEvent];
  reset: [];
}>();
</script>

<style scoped>
.resize-trigger-y {
  height: 8px;
  cursor: row-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
  margin: -4px 0;
  z-index: 10;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle-line {
  width: 36px;
  height: 3px;
  border-radius: 1.5px;
  background: rgba(128, 128, 128, 0.4);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition:
    background 0.2s,
    width 0.2s;
}

.resize-trigger-y:hover,
.resize-trigger-y.is-resizing {
  background: rgba(var(--el-color-primary-rgb), 0.1);
}

.resize-trigger-y:hover .resize-handle-line,
.resize-trigger-y.is-resizing .resize-handle-line {
  background: var(--el-color-primary);
  width: 48px;
}
</style>
