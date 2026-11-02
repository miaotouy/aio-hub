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
import {
  Plus,
  Delete,
  Search,
  Close,
  Operation,
  Folder,
  FolderAdd,
  Sort,
  MagicStick,
  ArrowDown,
} from "@element-plus/icons-vue";

interface Props {
  isSelectionMode: boolean;
  selectedCount: number;
  filteredTotal: number;
  isUploading: boolean;
  isGenerating: boolean;
  searchQuery: string;
  sortBy: string;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "update:searchQuery", value: string): void;
  (e: "update:sortBy", value: string): void;
  (e: "toggle-selection-mode"): void;
  (e: "toggle-select-all"): void;
  (e: "batch-move"): void;
  (e: "batch-delete"): void;
  (e: "open-assets-dir"): void;
  (e: "upload-click"): void;
  (e: "generate-descriptions", overwrite: boolean): void;
  (e: "description-settings"): void;
}>();
</script>

<template>
  <div class="toolbar" :class="{ 'is-selection-mode': isSelectionMode }">
    <div class="left-tools">
      <div class="search-box">
        <el-input
          :model-value="searchQuery"
          @update:model-value="emit('update:searchQuery', $event as string)"
          placeholder="搜索资产 (ID、文件名、描述)..."
          :prefix-icon="Search"
          clearable
          size="small"
        />
      </div>
      <div class="sort-box">
        <el-select
          :model-value="sortBy"
          @update:model-value="emit('update:sortBy', $event as string)"
          size="small"
          style="width: 100%"
          :prefix-icon="Sort"
        >
          <el-option label="默认顺序" value="default" />
          <el-option label="名称 A-Z" value="name-asc" />
          <el-option label="名称 Z-A" value="name-desc" />
          <el-option label="ID A-Z" value="id-asc" />
          <el-option label="ID Z-A" value="id-desc" />
          <el-option label="大小 递增" value="size-asc" />
          <el-option label="大小 递减" value="size-desc" />
        </el-select>
      </div>
      <span v-if="!isSelectionMode" class="drag-upload-tip">
        <el-icon><FolderAdd /></el-icon>
        <span>可拖拽文件上传</span>
      </span>
    </div>

    <div class="actions">
      <template v-if="isSelectionMode">
        <span class="selection-count">已选 {{ selectedCount }} 项</span>
        <el-button size="small" @click="emit('toggle-select-all')">
          {{
            selectedCount > 0 && selectedCount === filteredTotal
              ? "取消全选"
              : "全选"
          }}
        </el-button>
      </template>

      <el-dropdown
        trigger="click"
        @command="
          (command: string) =>
            command === 'settings'
              ? emit('description-settings')
              : emit('generate-descriptions', command === 'overwrite')
        "
      >
        <el-button size="small" :icon="MagicStick">
          描述生成<el-icon class="dropdown-arrow"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              command="missing"
              :disabled="
                isGenerating ||
                (isSelectionMode ? selectedCount === 0 : filteredTotal === 0)
              "
            >
              {{ isSelectionMode ? "补全所选描述" : "补全当前列表描述" }}
            </el-dropdown-item>
            <el-dropdown-item
              command="overwrite"
              :disabled="
                isGenerating ||
                (isSelectionMode ? selectedCount === 0 : filteredTotal === 0)
              "
            >
              {{
                isSelectionMode ? "重新生成所选描述" : "重新生成当前列表描述"
              }}
            </el-dropdown-item>
            <el-dropdown-item command="settings" divided
              >生成设置…</el-dropdown-item
            >
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <template v-if="isSelectionMode">
        <el-button
          class="exit-selection"
          size="small"
          :icon="Close"
          @click="emit('toggle-selection-mode')"
          >退出批量</el-button
        >
        <el-divider direction="vertical" />
        <div class="batch-actions">
          <el-button
            size="small"
            :icon="FolderAdd"
            @click="emit('batch-move')"
            :disabled="selectedCount === 0"
          >
            移动到...
          </el-button>
          <el-button
            size="small"
            type="danger"
            :icon="Delete"
            @click="emit('batch-delete')"
            :disabled="selectedCount === 0"
          >
            删除
          </el-button>
        </div>
      </template>
      <template v-else>
        <el-tooltip content="批量管理资产" :show-after="500" placement="top">
          <el-button
            size="small"
            :icon="Operation"
            @click="emit('toggle-selection-mode')"
          >
            批量
          </el-button>
        </el-tooltip>
        <el-tooltip
          content="打开本地资产目录"
          :show-after="500"
          placement="top"
        >
          <el-button
            size="small"
            :icon="Folder"
            @click="emit('open-assets-dir')"
          />
        </el-tooltip>
        <el-button
          size="small"
          type="primary"
          :icon="Plus"
          :loading="isUploading"
          @click="emit('upload-click')"
        >
          上传
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dropdown-arrow {
  margin-left: 6px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
}

.left-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 360px;
  flex-wrap: wrap;
  min-width: 0;
}

.selection-count {
  font-size: 13px;
  color: var(--el-text-color-regular);
  font-weight: 500;
  white-space: nowrap;
}

.search-box {
  flex: 1;
  min-width: 200px;
  max-width: 260px;
}

.sort-box {
  width: 150px;
  flex-shrink: 0;
}

.drag-upload-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  user-select: none;
}

.drag-upload-tip .el-icon {
  font-size: 14px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.is-selection-mode .left-tools,
.is-selection-mode .actions {
  flex-basis: 100%;
}

.batch-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.exit-selection {
  order: 1;
}

@media (max-width: 640px) {
  .search-box {
    max-width: none;
  }

  .drag-upload-tip {
    display: none;
  }
}
</style>
