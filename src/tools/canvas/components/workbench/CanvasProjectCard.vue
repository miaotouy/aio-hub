<script setup lang="ts">
import { computed } from "vue";
import { MoreVertical, ExternalLink, Trash2, FileText, Clock } from "lucide-vue-next";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { CanvasListItem } from "../../types";
import { ElMessageBox } from "element-plus";

const props = defineProps<{
  canvas: CanvasListItem;
  viewMode: "grid" | "list";
}>();

const emit = defineEmits<{
  (e: "open"): void;
  (e: "delete"): void;
  (e: "open-vscode"): void;
}>();

const relativeTime = computed(() => {
  return formatDistanceToNow(props.canvas.metadata.updatedAt, {
    addSuffix: true,
    locale: zhCN,
  });
});

const statusType = computed(() => {
  switch (props.canvas.status) {
    case "open":
      return "success";
    case "pending":
      return "warning";
    case "syncing":
      return "primary";
    default:
      return "info";
  }
});

const statusLabel = computed(() => {
  switch (props.canvas.status) {
    case "open":
      return "正在编辑";
    case "pending":
      return "待提交";
    case "syncing":
      return "同步中";
    default:
      return "空闲";
  }
});

const handleDelete = async () => {
  try {
    await ElMessageBox.confirm(`确定要删除画布 "${props.canvas.metadata.name}" 吗？此操作不可撤销。`, "删除确认", {
      confirmButtonText: "确定删除",
      cancelButtonText: "取消",
      type: "warning",
      confirmButtonClass: "el-button--danger",
    });
    emit("delete");
  } catch {
    // 用户取消
  }
};
</script>

<template>
  <div class="canvas-project-card" :class="[viewMode, { 'is-active': canvas.status === 'open' }]" @click="emit('open')">
    <!-- 卡片模式 -->
    <template v-if="viewMode === 'grid'">
      <div class="card-header">
        <div class="title-area">
          <span class="emoji">🎨</span>
          <h3 class="title" :title="canvas.metadata.name">{{ canvas.metadata.name }}</h3>
        </div>
        <el-tag :type="statusType" size="small" effect="plain" class="status-tag">
          {{ statusLabel }}
        </el-tag>
      </div>

      <div class="card-body">
        <div class="stats">
          <div class="stat-item">
            <el-icon><FileText :size="14" /></el-icon>
            <span>{{ canvas.metadata.fileCount }} 个文件</span>
          </div>
          <div v-if="canvas.pendingFileCount > 0" class="stat-item pending">
            <div class="dot"></div>
            <span>{{ canvas.pendingFileCount }} 个待定更改</span>
          </div>
        </div>
        <div class="time">
          <el-icon><Clock :size="14" /></el-icon>
          <span>更新于 {{ relativeTime }}</span>
        </div>
      </div>

      <div class="card-footer" @click.stop>
        <el-button size="small" type="primary" plain @click="emit('open')"> 打开预览 </el-button>

        <el-dropdown trigger="click">
          <div class="more-btn">
            <el-icon><MoreVertical :size="16" /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="emit('open-vscode')">
                <el-icon><ExternalLink :size="14" /></el-icon>
                <span>在 VSCode 中打开</span>
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleDelete" class="delete-item">
                <el-icon><Trash2 :size="14" /></el-icon>
                <span>删除项目</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </template>

    <!-- 列表模式 -->
    <template v-else>
      <div class="list-item-content">
        <span class="emoji">🎨</span>
        <div class="list-title" :title="canvas.metadata.name">{{ canvas.metadata.name }}</div>

        <div class="list-stats">
          <span class="file-count">{{ canvas.metadata.fileCount }} files</span>
          <el-tag v-if="canvas.pendingFileCount > 0" type="warning" size="small" class="pending-tag">
            {{ canvas.pendingFileCount }} pending
          </el-tag>
        </div>

        <div class="list-time">
          {{ relativeTime }}
        </div>

        <div class="list-status">
          <el-tag :type="statusType" size="small" effect="light">
            {{ statusLabel }}
          </el-tag>
        </div>

        <div class="list-actions" @click.stop>
          <el-tooltip content="在 VSCode 中打开" placement="top">
            <div class="action-icon" @click="emit('open-vscode')">
              <el-icon><ExternalLink :size="16" /></el-icon>
            </div>
          </el-tooltip>

          <el-dropdown trigger="click">
            <div class="action-icon">
              <el-icon><MoreVertical :size="16" /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleDelete" class="delete-item">
                  <el-icon><Trash2 :size="14" /></el-icon>
                  <span>删除</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.canvas-project-card {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    transform: translateY(-2px);
    box-shadow: var(--el-box-shadow-light);
  }

  &.is-active {
    border-color: var(--el-color-primary);
    background-color: rgba(var(--el-color-primary-rgb), 0.05);
  }

  /* Grid Mode */
  &.grid {
    display: flex;
    flex-direction: column;
    height: 180px;
    padding: 16px;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;

      .title-area {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;

        .emoji {
          font-size: 20px;
        }

        .title {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--el-text-color-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }

    .card-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;

      .stats {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .stat-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--el-text-color-regular);

          &.pending {
            color: var(--el-color-warning);

            .dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background-color: var(--el-color-warning);
            }
          }
        }
      }

      .time {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;

      .more-btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        color: var(--el-text-color-secondary);
        transition: all 0.2s;

        &:hover {
          background-color: var(--el-fill-color-light);
          color: var(--el-text-color-primary);
        }
      }
    }
  }

  /* List Mode */
  &.list {
    padding: 8px 16px;
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }

    .list-item-content {
      display: flex;
      align-items: center;
      gap: 16px;

      .emoji {
        font-size: 18px;
      }

      .list-title {
        flex: 1;
        font-size: 14px;
        font-weight: 500;
        color: var(--el-text-color-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .list-stats {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 150px;

        .file-count {
          font-size: 13px;
          color: var(--el-text-color-secondary);
        }
      }

      .list-time {
        width: 120px;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }

      .list-status {
        width: 100px;
      }

      .list-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .action-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          color: var(--el-text-color-secondary);
          transition: all 0.2s;

          &:hover {
            background-color: var(--el-fill-color-light);
            color: var(--el-text-color-primary);
          }
        }
      }
    }
  }
}

.delete-item {
  color: var(--el-color-danger) !important;

  &:hover {
    background-color: var(--el-color-danger-light-9) !important;
  }
}
</style>
