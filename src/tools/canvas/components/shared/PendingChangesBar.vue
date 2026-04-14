<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import { Check, X, Plus, FileEdit, AlertCircle, Trash2 } from "lucide-vue-next";
import FileIcon from "@/components/common/FileIcon.vue";

const props = defineProps<{
  canvasId: string;
  dirtyFiles: Map<string, string>; // filepath -> status ('new'|'modified'|'deleted')
}>();

const emit = defineEmits<{
  (e: "commit"): void;
  (e: "discard"): void;
}>();

const fileList = computed(() => {
  const list: Array<{ path: string; name: string; status: string }> = [];
  props.dirtyFiles.forEach((status, path) => {
    list.push({
      path,
      name: path.split("/").pop() || path,
      status,
    });
  });
  return list.sort((a, b) => a.path.localeCompare(b.path));
});

const hasChanges = computed(() => fileList.value.length > 0);

const handleDiscard = () => {
  ElMessageBox.confirm("确定要丢弃所有未提交的更改吗？此操作不可撤销。", "提示", {
    confirmButtonText: "确定丢弃",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("discard");
    })
    .catch(() => {});
};
</script>

<template>
  <div class="pending-changes-bar">
    <div class="bar-header">
      <span class="title">未提交更改 ({{ fileList.length }})</span>
      <div class="actions" v-if="hasChanges">
        <el-tooltip content="丢弃所有更改" placement="top">
          <el-button link type="danger" :icon="X" @click="handleDiscard" />
        </el-tooltip>
        <el-tooltip content="提交所有更改" placement="top">
          <el-button link type="success" :icon="Check" @click="emit('commit')" />
        </el-tooltip>
      </div>
    </div>

    <div class="changes-list" v-if="hasChanges">
      <div v-for="file in fileList" :key="file.path" class="change-item">
        <FileIcon :file-name="file.name" :size="14" class="file-icon" />
        <span class="file-path" :title="file.path">{{ file.name }}</span>
        <div class="status-tag" :class="file.status">
          <FileEdit v-if="file.status === 'modified'" :size="12" />
          <Plus v-else-if="file.status === 'new'" :size="12" />
          <Trash2 v-else-if="file.status === 'deleted'" :size="12" />
        </div>
      </div>
    </div>

    <div v-else class="no-changes">
      <el-icon class="info-icon"><AlertCircle :size="14" /></el-icon>
      <span>没有未提交的更改</span>
    </div>

    <div class="bottom-actions" v-if="hasChanges">
      <el-button type="primary" class="commit-btn" size="small" @click="emit('commit')">
        提交所有更改 (Commit All)
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pending-changes-bar {
  display: flex;
  flex-direction: column;
  background-color: rgba(var(--card-bg-rgb), calc(var(--card-opacity) * 0.5));
  border-top: var(--border-width) solid var(--border-color);
  max-height: 300px;
  overflow: hidden;
}

.bar-header {
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(var(--el-fill-color-light-rgb), calc(var(--card-opacity) * 0.3));
  flex-shrink: 0;

  .title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--el-text-color-secondary);
  }

  .actions {
    display: flex;
    gap: 4px;
  }
}

.changes-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.change-item {
  height: 24px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: default;

  &:hover {
    background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  }

  .file-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--el-text-color-regular);
  }

  .status-tag {
    &.modified {
      color: var(--el-color-success);
    }
    &.new {
      color: var(--el-color-warning);
    }
    &.deleted {
      color: var(--el-color-danger);
    }
  }
}

.no-changes {
  height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;

  .info-icon {
    opacity: 0.5;
  }
}

.bottom-actions {
  padding: 8px 12px;
  flex-shrink: 0;

  .commit-btn {
    width: 100%;
  }
}
</style>
