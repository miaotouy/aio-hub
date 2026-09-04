<template>
  <div class="batch-result-toolbar">
    <!-- 左侧：筛选器 -->
    <div class="toolbar-filters">
      <div class="filter-group">
        <label class="filter-label">
          <el-icon><ChromeFilled /></el-icon>
          色系
        </label>
        <el-select
          :model-value="filter.colorFamilies"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="全部色系"
          size="small"
          style="width: 180px"
          @update:model-value="
            $emit('update:filter', { ...filter, colorFamilies: $event })
          "
        >
          <el-option
            v-for="family in BATCH_COLOR_FAMILIES"
            :key="family"
            :label="family"
            :value="family"
          />
        </el-select>
      </div>

      <div class="filter-group">
        <label class="filter-label">
          <el-icon><Sunny /></el-icon>
          亮度
        </label>
        <el-select
          :model-value="filter.brightnessLevels"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="全部亮度"
          size="small"
          style="width: 180px"
          @update:model-value="
            $emit('update:filter', { ...filter, brightnessLevels: $event })
          "
        >
          <el-option
            v-for="level in BATCH_BRIGHTNESS_LEVELS"
            :key="level"
            :label="level"
            :value="level"
          />
        </el-select>
      </div>
    </div>

    <!-- 右侧：统计与操作 -->
    <div class="toolbar-actions">
      <el-tag v-if="filteredCount < totalCount" type="info" size="small">
        筛选 {{ filteredCount }} / {{ totalCount }} 张
      </el-tag>
      <el-tag v-else size="small">共 {{ totalCount }} 张</el-tag>

      <el-tag v-if="selectedCount > 0" type="primary" size="small">
        已选 {{ selectedCount }} 张
      </el-tag>

      <el-button-group size="small">
        <el-button @click="$emit('select-filtered')">全选当前</el-button>
        <el-button @click="$emit('clear-selection')">清空选择</el-button>
      </el-button-group>

      <el-dropdown trigger="click" size="small">
        <el-button size="small">
          导出报告
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="$emit('export-csv')">
              <el-icon><Document /></el-icon>
              导出 CSV
            </el-dropdown-item>
            <el-dropdown-item @click="$emit('export-json')">
              <el-icon><Document /></el-icon>
              导出 JSON
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-button
        type="primary"
        size="small"
        :disabled="selectedCount === 0"
        @click="$emit('start-archive')"
      >
        <el-icon style="margin-right: 4px"><FolderOpened /></el-icon>
        开始归档
      </el-button>

      <el-button
        v-if="failedCount > 0"
        type="warning"
        size="small"
        @click="$emit('retry-failed')"
      >
        重试失败 ({{ failedCount }})
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ChromeFilled,
  Sunny,
  ArrowDown,
  Document,
  FolderOpened,
} from "@element-plus/icons-vue";
import {
  BATCH_COLOR_FAMILIES,
  BATCH_BRIGHTNESS_LEVELS,
} from "../batchColorOrganizer";
import type { BatchFilterState } from "../batchColorOrganizer";

interface Props {
  filter: BatchFilterState;
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  failedCount: number;
}

defineProps<Props>();

defineEmits<{
  (e: "update:filter", value: BatchFilterState): void;
  (e: "select-filtered"): void;
  (e: "clear-selection"): void;
  (e: "export-csv"): void;
  (e: "export-json"): void;
  (e: "retry-failed"): void;
  (e: "start-archive"): void;
}>();
</script>

<style scoped>
.batch-result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: transparent;
  border-bottom: var(--border-width) solid var(--border-color);
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-filters {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .batch-result-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-filters,
  .toolbar-actions {
    width: 100%;
  }

  .toolbar-actions {
    justify-content: space-between;
  }
}
</style>

