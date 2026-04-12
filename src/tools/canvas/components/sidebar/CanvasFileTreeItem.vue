<script setup lang="ts">
import { ref } from "vue";
import { ChevronRight, Folder, FolderOpen, Plus, Trash2 } from "lucide-vue-next";
import type { CanvasFileNode } from "../../types";
import FileIcon from "@/components/common/FileIcon.vue";

const props = defineProps<{
  node: CanvasFileNode;
  depth: number;
  activeFile: string | null;
}>();

const emit = defineEmits<{
  (e: "select", path: string): void;
}>();

const isExpanded = ref(true);

const toggleExpand = () => {
  if (props.node.isDirectory) {
    isExpanded.value = !isExpanded.value;
  }
};

const handleSelect = () => {
  if (props.node.isDirectory) {
    toggleExpand();
  } else {
    emit("select", props.node.path);
  }
};

const onChildSelect = (path: string) => {
  emit("select", path);
};
</script>

<template>
  <div class="file-tree-item-container">
    <div
      class="file-tree-item"
      :class="{
        'is-active': activeFile === node.path,
        'is-directory': node.isDirectory,
        'is-deleted': node.status === 'deleted',
      }"
      :style="{ paddingLeft: `${12 + depth * 16}px` }"
      @click="handleSelect"
    >
      <div class="item-icon-wrapper">
        <template v-if="node.isDirectory">
          <el-icon class="arrow-icon" :class="{ 'is-rotated': isExpanded }">
            <ChevronRight :size="14" />
          </el-icon>
          <el-icon class="folder-icon">
            <FolderOpen v-if="isExpanded" :size="16" />
            <Folder v-else :size="16" />
          </el-icon>
        </template>
        <template v-else>
          <FileIcon :file-name="node.name" :size="16" class="file-icon" />
        </template>
      </div>

      <span class="item-name">{{ node.name }}</span>

      <div class="item-status" v-if="!node.isDirectory">
        <div v-if="node.status === 'modified'" class="status-dot modified" title="已修改"></div>
        <div v-if="node.status === 'new'" class="status-icon new" title="新增文件">
          <Plus :size="10" />
        </div>
        <div v-if="node.status === 'deleted'" class="status-icon deleted" title="已删除">
          <Trash2 :size="10" />
        </div>
      </div>
    </div>

    <div v-if="node.isDirectory && isExpanded" class="item-children">
      <CanvasFileTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :active-file="activeFile"
        @select="onChildSelect"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-tree-item {
  height: 28px;
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: all 0.2s;
  gap: 6px;

  &:hover {
    background-color: rgba(var(--el-color-primary-rgb), 0.05);
  }

  &.is-active {
    background-color: rgba(var(--el-color-primary-rgb), 0.1);
    color: var(--el-color-primary);
    font-weight: 500;
  }

  &.is-deleted {
    opacity: 0.6;
    .item-name {
      text-decoration: line-through;
    }
  }

  .item-icon-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 32px;
    flex-shrink: 0;

    .arrow-icon {
      transition: transform 0.2s;
      color: var(--el-text-color-placeholder);

      &.is-rotated {
        transform: rotate(90deg);
      }
    }

    .folder-icon {
      color: var(--el-color-warning);
    }
  }

  .item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-status {
    margin-right: 8px;
    display: flex;
    align-items: center;

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      
      &.modified {
        background-color: var(--el-color-success);
      }
    }

    .status-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      
      &.new {
        color: var(--el-color-success);
      }

      &.deleted {
        color: var(--el-color-danger);
      }
    }
  }
}

.item-children {
  display: flex;
  flex-direction: column;
}
</style>