<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, RefreshCw, Trash2, Filter } from "lucide-vue-next";
import type { TaskStatus } from "../core/async-task/types";

interface Props {
  totalCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

interface Emits {
  (e: "refresh"): void;
  (e: "clear-completed"): void;
  (e: "clear-failed"): void;
  (e: "clear-all"): void;
  (e: "status-change", status: TaskStatus | "all"): void;
  (e: "search", keyword: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedStatus = ref<TaskStatus | "all">("all");
const searchKeyword = ref("");

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "等待中", value: "pending" },
  { label: "执行中", value: "running" },
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
  { label: "已取消", value: "cancelled" },
  { label: "已中断", value: "interrupted" },
];

const statusCounts = computed(() => {
  return {
    all: props.totalCount,
    active: props.activeCount,
    completed: props.completedCount,
    failed: props.failedCount,
  };
});

function handleStatusChange(status: TaskStatus | "all") {
  selectedStatus.value = status;
  emit("status-change", status);
}

function handleSearch() {
  emit("search", searchKeyword.value);
}
</script>

<template>
  <div class="task-toolbar">
    <!-- 左侧：筛选和搜索 -->
    <div class="toolbar-left">
      <!-- 状态筛选 -->
      <div class="filter-group">
        <el-icon class="filter-icon"><Filter /></el-icon>
        <el-select v-model="selectedStatus" placeholder="筛选状态" style="width: 140px" @change="handleStatusChange">
          <el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </div>

      <!-- 搜索框 -->
      <el-input
        v-model="searchKeyword"
        placeholder="搜索任务ID或工具名称"
        :prefix-icon="Search"
        clearable
        style="width: 280px"
        @input="handleSearch"
        @clear="handleSearch"
      />

      <!-- 统计信息 -->
      <div class="stats">
        <el-tag type="info" size="small">总计: {{ statusCounts.all }}</el-tag>
        <el-tag type="primary" size="small">活跃: {{ statusCounts.active }}</el-tag>
        <el-tag type="success" size="small">完成: {{ statusCounts.completed }}</el-tag>
        <el-tag type="danger" size="small">失败: {{ statusCounts.failed }}</el-tag>
      </div>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="toolbar-right">
      <!-- 刷新按钮 -->
      <el-button :icon="RefreshCw" @click="emit('refresh')"> 刷新 </el-button>

      <!-- 批量操作下拉菜单 -->
      <el-dropdown trigger="click">
        <el-button :icon="Trash2" type="danger">
          批量清理
          <el-icon class="el-icon--right"><component :is="'arrow-down'" /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :disabled="completedCount === 0" @click="emit('clear-completed')">
              清理已完成 ({{ completedCount }})
            </el-dropdown-item>
            <el-dropdown-item :disabled="failedCount === 0" @click="emit('clear-failed')">
              清理失败 ({{ failedCount }})
            </el-dropdown-item>
            <el-dropdown-item divided :disabled="totalCount === 0" @click="emit('clear-all')">
              清理全部 ({{ totalCount }})
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.task-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-icon {
  color: var(--el-text-color-secondary);
}

.stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
}

.auto-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-left: 1px solid var(--border-color);
}

.auto-refresh .label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

@media (max-width: 1200px) {
  .task-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-left,
  .toolbar-right {
    width: 100%;
    justify-content: space-between;
  }

  .auto-refresh {
    border-left: none;
    padding: 0;
  }
}
</style>
