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
import { computed } from "vue";
import type { CanvasListItem } from "../../types";
import CanvasProjectCard from "./CanvasProjectCard.vue";

const props = defineProps<{
  canvases: CanvasListItem[];
  viewMode: "grid" | "list";
  searchQuery: string;
}>();

const emit = defineEmits<{
  (e: "open", canvasId: string): void;
  (e: "delete", canvasId: string): void;
  (e: "open-vscode", canvasId: string): void;
  (e: "preview", canvasId: string): void;
  (
    e: "repair",
    canvasId: string,
    action: "remove_index" | "reindex" | "restore_metadata"
  ): void;
}>();

const filteredCanvases = computed(() => {
  const query = props.searchQuery.trim().toLowerCase();
  if (!query) return props.canvases;
  return props.canvases.filter((c) =>
    c.metadata.name.toLowerCase().includes(query)
  );
});
</script>

<template>
  <div class="canvas-project-list" :class="viewMode">
    <template v-if="filteredCanvases.length > 0">
      <div :class="viewMode === 'grid' ? 'grid-container' : 'list-container'">
        <CanvasProjectCard
          v-for="canvas in filteredCanvases"
          :key="canvas.metadata.id"
          :canvas="canvas"
          :view-mode="viewMode"
          @open="emit('open', canvas.metadata.id)"
          @delete="emit('delete', canvas.metadata.id)"
          @open-vscode="emit('open-vscode', canvas.metadata.id)"
          @preview="emit('preview', canvas.metadata.id)"
          @repair="(action) => emit('repair', canvas.metadata.id, action)"
        />
      </div>
    </template>

    <div v-else class="empty-state">
      <el-empty
        :description="
          searchQuery ? '没有找到匹配的画布' : '还没有画布，快去创建一个吧！'
        "
      >
        <template v-if="!searchQuery" #extra>
          <slot name="empty-action"></slot>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas-project-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  /* 隐藏滚动条但保留功能 */
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color-light);
    border-radius: 3px;
  }
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  align-content: start;
}

.list-container {
  display: flex;
  flex-direction: column;
  max-width: 1200px;
  margin: 0 auto;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
