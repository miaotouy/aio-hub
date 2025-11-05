<template>
  <InfoCard title="扫描结果" class="result-card">
    <template #headerExtra>
      <div v-if="filteredItems.length > 0 && !showProgress" class="header-actions">
        <el-tag type="info" size="large">
          {{ selectedItems.length }} / {{ filteredItems.length }} 项
        </el-tag>
        <el-tag type="warning" size="large">
          {{ formatBytes(selectedSize) }}
        </el-tag>
        <el-button
          type="danger"
          :disabled="selectedItems.length === 0"
          @click="handleConfirmCleanup"
          :icon="Delete"
        >
          清理选中项
        </el-button>
      </div>
    </template>

    <!-- 扫描进度 -->
    <div v-if="showProgress" class="progress-section">
      <div class="progress-header">
        <span class="progress-title">正在扫描...</span>
        <span v-if="scanProgress" class="progress-stats">
          已扫描: {{ scanProgress.scannedCount }} 项
          <span v-if="scanProgress.foundItems > 0">| 找到: {{ scanProgress.foundItems }} 项</span>
        </span>
      </div>

      <div v-if="scanProgress" class="progress-details">
        <div class="current-path">当前: {{ formatCurrentPath(scanProgress.currentPath) }}</div>
        <div class="depth-info">深度: {{ scanProgress.currentDepth }} 层</div>
      </div>
    </div>

    <!-- 清理进度 -->
    <div v-if="isCleaning" class="progress-section cleanup-progress">
      <div class="progress-header">
        <span class="progress-title">正在清理...</span>
        <div class="progress-header-right">
          <span v-if="cleanupProgress" class="progress-stats">
            进度: {{ cleanupProgress.processedCount }} / {{ cleanupProgress.totalCount }}
            <span v-if="cleanupProgress.successCount > 0">| 成功: {{ cleanupProgress.successCount }}</span>
            <span v-if="cleanupProgress.errorCount > 0" class="error-count">| 失败: {{ cleanupProgress.errorCount }}</span>
          </span>
          <el-button type="danger" size="small" @click="handleStopCleanup">
            停止清理
          </el-button>
        </div>
      </div>

      <div v-if="cleanupProgress" class="progress-details">
        <div class="current-path">当前: {{ formatCurrentPath(cleanupProgress.currentItem) }}</div>
        <el-progress
          :percentage="Math.round((cleanupProgress.processedCount / cleanupProgress.totalCount) * 100)"
          :status="cleanupProgress.errorCount > 0 ? 'exception' : undefined"
        />
      </div>
    </div>

    <!-- 空状态：未开始分析 -->
    <div v-if="!hasAnalyzed && !showProgress && !isCleaning" class="empty-state">
      <el-empty description="配置过滤条件并点击分析按钮">
        <template #image>
          <el-icon :size="64">
            <FolderDelete />
          </el-icon>
        </template>
      </el-empty>
    </div>

    <!-- 空状态：未找到结果 -->
    <div v-else-if="filteredItems.length === 0 && !hasActiveFilters && !showProgress && !isCleaning" class="empty-state">
      <el-empty description="未找到符合条件的项目">
        <template #image>
          <el-icon :size="64">
            <SuccessFilled />
          </el-icon>
        </template>
      </el-empty>
    </div>

    <!-- 结果列表 -->
    <div v-if="hasAnalyzed && (filteredItems.length > 0 || hasActiveFilters)" class="result-content">
      <!-- 二次筛选区域 -->
      <div class="result-filters">
        <div class="filter-row">
          <el-input
            v-model="localFilterNamePattern"
            placeholder="在结果中筛选名称..."
            clearable
            size="small"
            style="flex: 1"
          >
            <template #prepend>
              <el-icon>
                <Filter />
              </el-icon>
            </template>
          </el-input>
          
          <div class="filter-item">
            <span class="filter-label">最小天数</span>
            <el-input-number
              v-model="localFilterMinAgeDays"
              :min="0"
              placeholder="天数"
              controls-position="right"
              size="small"
              style="width: 100px"
            />
          </div>
          
          <div class="filter-item">
            <span class="filter-label">最小大小</span>
            <el-input-number
              v-model="localFilterMinSizeMB"
              :min="0"
              placeholder="MB"
              controls-position="right"
              size="small"
              style="width: 100px"
            />
          </div>
          <el-button size="small" @click="clearFilters" :disabled="!props.hasActiveFilters">
            清除筛选
          </el-button>
        </div>
      </div>

      <div class="result-header">
        <el-checkbox v-model="selectAll" @change="handleSelectAll" :indeterminate="isIndeterminate">
          全选
        </el-checkbox>
        <div class="stats-info">
          <span>显示: {{ filteredItems.length }} / {{ allItemsCount }} 项</span>
          <span>总大小: {{ formatBytes(props.filteredStatistics.totalSize) }}</span>
          <span>目录: {{ props.filteredStatistics.totalDirs }}</span>
          <span>文件: {{ props.filteredStatistics.totalFiles }}</span>
        </div>
      </div>

      <el-scrollbar class="items-scrollbar">
        <div class="items-list">
          <div
            v-for="item in filteredItems"
            :key="item.path"
            class="item-row"
            :class="{ selected: selectedPaths.has(item.path) }"
          >
            <el-checkbox :model-value="selectedPaths.has(item.path)" @change="toggleItem(item)" />
            <el-icon class="item-icon" :class="{ 'is-dir': item.isDir }">
              <component :is="item.isDir ? Folder : Document" />
            </el-icon>
            <div class="item-info">
              <div class="item-name" :title="item.name">{{ item.name }}</div>
              <div class="item-meta">
                <span class="item-path" :title="item.path">{{ item.path }}</span>
                <span class="item-size">{{ formatBytes(item.size) }}</span>
                <span class="item-age">{{ formatAge(item.modified) }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  Delete,
  Filter,
  FolderDelete,
  SuccessFilled,
  Folder,
  Document,
} from "@element-plus/icons-vue";
import InfoCard from "../../../components/common/InfoCard.vue";
import { formatBytes, formatAge, formatCurrentPath } from "../utils";
import type { ItemInfo, DirectoryScanProgress, DirectoryCleanupProgress, Statistics } from "../types";

interface Props {
  filteredItems: ItemInfo[];
  allItemsCount: number;
  selectedPaths: Set<string>;
  hasAnalyzed: boolean;
  showProgress: boolean;
  scanProgress: DirectoryScanProgress | null;
  isCleaning: boolean;
  cleanupProgress: DirectoryCleanupProgress | null;
  filteredStatistics: Statistics;
  hasActiveFilters: boolean;
  filterNamePattern: string;
  filterMinAgeDays?: number;
  filterMinSizeMB?: number;
}

interface Emits {
  (e: "update:selectedPaths", value: Set<string>): void;
  (e: "update:filterNamePattern", value: string): void;
  (e: "update:filterMinAgeDays", value: number | undefined): void;
  (e: "update:filterMinSizeMB", value: number | undefined): void;
  (e: "cleanup", paths: string[]): void;
  (e: "stopCleanup"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 本地筛选状态
const localFilterNamePattern = ref(props.filterNamePattern);
const localFilterMinAgeDays = ref(props.filterMinAgeDays);
const localFilterMinSizeMB = ref(props.filterMinSizeMB);

// 同步筛选状态到父组件（Context）
watch(localFilterNamePattern, (value) => emit("update:filterNamePattern", value));
watch(localFilterMinAgeDays, (value) => emit("update:filterMinAgeDays", value));
watch(localFilterMinSizeMB, (value) => emit("update:filterMinSizeMB", value));

// 同步父组件（Context）状态到本地
watch(
  () => props.filterNamePattern,
  (value) => (localFilterNamePattern.value = value)
);
watch(
  () => props.filterMinAgeDays,
  (value) => (localFilterMinAgeDays.value = value)
);
watch(
  () => props.filterMinSizeMB,
  (value) => (localFilterMinSizeMB.value = value)
);

// 清除筛选条件（通过 emit 通知 Context）
const clearFilters = () => {
  emit("update:filterNamePattern", "");
  emit("update:filterMinAgeDays", undefined);
  emit("update:filterMinSizeMB", undefined);
};

// 选中的项目
const selectedItems = computed(() =>
  props.filteredItems.filter((item: ItemInfo) => props.selectedPaths.has(item.path))
);

const selectedSize = computed(() =>
  selectedItems.value.reduce((sum: number, item: ItemInfo) => sum + item.size, 0)
);

// 全选状态
const selectAll = ref(false);
const isIndeterminate = computed(
  () => props.selectedPaths.size > 0 && props.selectedPaths.size < props.filteredItems.length
);

// 切换项目选择
const toggleItem = (item: ItemInfo) => {
  const newSet = new Set(props.selectedPaths);
  if (newSet.has(item.path)) {
    newSet.delete(item.path);
  } else {
    newSet.add(item.path);
  }
  emit("update:selectedPaths", newSet);
};

// 全选/取消全选
const handleSelectAll = (checked: boolean) => {
  const newSet = new Set(props.selectedPaths);
  if (checked) {
    props.filteredItems.forEach((item) => newSet.add(item.path));
  } else {
    newSet.clear();
  }
  emit("update:selectedPaths", newSet);
};

// 监听选择变化更新全选状态
watch(
  () => [props.selectedPaths, props.filteredItems],
  () => {
    if (props.filteredItems.length === 0) {
      selectAll.value = false;
      return;
    }
    selectAll.value = props.selectedPaths.size === props.filteredItems.length;
  },
  { deep: true }
);

// 确认清理
const handleConfirmCleanup = async () => {
  const count = selectedItems.value.length;
  const size = formatBytes(selectedSize.value);

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${count} 项（共 ${size}）吗？\n\n这些项目将被移入回收站，可以恢复。`,
      "确认清理",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
        distinguishCancelAndClose: true,
      }
    );

    const pathsToClean = Array.from(props.selectedPaths);
    emit("cleanup", pathsToClean);
  } catch {
    // 用户取消
  }
};

// 停止清理
const handleStopCleanup = () => {
  emit("stopCleanup");
};
</script>

<style scoped>
.result-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.stats-info {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-color-light);
}

.result-filters {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.filter-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: 13px;
  color: var(--text-color-light);
  white-space: nowrap;
}

.items-scrollbar {
  flex: 1;
  min-height: 0;
}

.items-list {
  padding: 8px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
}

.item-row:hover {
  background-color: var(--container-bg);
}

.item-row.selected {
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.item-icon {
  font-size: 18px;
  color: var(--text-color-light);
}

.item-icon.is-dir {
  color: var(--el-color-warning);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-color-light);
}

.item-path {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-size,
.item-age {
  flex-shrink: 0;
}

/* 进度条样式 */
.progress-section {
  margin-bottom: 16px;
  padding: 16px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.progress-stats {
  font-size: 12px;
  color: var(--text-color-light);
}

.progress-details {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-color-light);
}

.current-path {
  margin-bottom: 4px;
  font-family: monospace;
  word-break: break-all;
}

.depth-info {
  color: var(--text-color-lighter);
}

.cleanup-progress {
  border-color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 5%, var(--container-bg));
}

.error-count {
  color: var(--el-color-error);
}
</style>
