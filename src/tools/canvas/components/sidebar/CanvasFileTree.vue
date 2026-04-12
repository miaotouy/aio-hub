<script setup lang="ts">
import type { CanvasFileNode } from "../../types";
import CanvasFileTreeItem from "./CanvasFileTreeItem.vue";

defineProps<{
  nodes: CanvasFileNode[];
  activeFile: string | null;
}>();

const emit = defineEmits<{
  (e: "select", path: string): void;
}>();

const handleSelect = (path: string) => {
  emit("select", path);
};
</script>

<template>
  <div class="canvas-file-tree">
    <div v-if="nodes.length === 0" class="empty-tree">
      <el-empty description="暂无文件" :image-size="60" />
    </div>
    <div v-else class="tree-content">
      <CanvasFileTreeItem
        v-for="node in nodes"
        :key="node.path"
        :node="node"
        :depth="0"
        :active-file="activeFile"
        @select="handleSelect"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas-file-tree {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 8px 0;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color-lighter);
    border-radius: 4px;
  }

  .empty-tree {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
  }
}
</style>