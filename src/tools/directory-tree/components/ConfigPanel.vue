<template>
  <InfoCard title="配置选项" class="config-card">
    <div class="config-content">
      <div class="config-section">
        <div class="label-with-action">
          <label>目标路径</label>
          <el-popover v-if="sortedPathHistory.length > 0" placement="bottom-start" :width="400" trigger="click">
            <template #reference>
              <el-button :icon="Clock" title="路径历史" text size="small" />
            </template>
            <div class="history-menu">
              <div class="history-header">
                <span class="history-title">路径历史</span>
                <el-button text size="small" @click="onClearHistory">清空</el-button>
              </div>
              <div class="history-list">
                <div
                  v-for="item in sortedPathHistory"
                  :key="item.path"
                  class="history-item"
                  @click="onSelectHistoryPath(item.path)"
                >
                  <div class="history-item-content">
                    <el-icon class="history-icon"><FolderOpened /></el-icon>
                    <div class="history-path">
                      <div class="path-text" :title="item.path">{{ item.path }}</div>
                      <div class="path-meta">
                        <span class="access-count">{{ item.accessCount }} 次</span>
                        <span class="access-time">{{ formatHistoryTime(item.lastAccessTime) }}</span>
                      </div>
                    </div>
                  </div>
                  <el-button
                    text
                    :icon="Delete"
                    size="small"
                    class="delete-btn"
                    @click.stop="onRemoveHistoryPath(item.path)"
                  />
                </div>
              </div>
            </div>
          </el-popover>
        </div>
        <DropZone variant="input" :directory-only="true" :multiple="false" hide-content @drop="handlePathDrop">
          <div class="path-input-group">
            <el-input
              :model-value="targetPath"
              @update:model-value="$emit('update:targetPath', $event)"
              placeholder="输入或选择目录路径（支持拖拽）"
              @keyup.enter="$emit('generate')"
            />
            <el-button @click="$emit('selectDirectory')" :icon="FolderOpened">选择</el-button>
          </div>
        </DropZone>
      </div>

      <div class="config-section">
        <label>显示选项</label>
        <div class="checkbox-group">
          <el-checkbox :model-value="showFiles" @update:model-value="$emit('update:showFiles', $event)">
            显示文件
          </el-checkbox>
          <el-checkbox :model-value="showHidden" @update:model-value="$emit('update:showHidden', $event)">
            显示隐藏文件
          </el-checkbox>
          <el-checkbox
            :model-value="autoGenerateOnDrop"
            @update:model-value="$emit('update:autoGenerateOnDrop', $event)"
          >
            拖拽后自动生成
          </el-checkbox>
        </div>
      </div>

      <div class="config-section">
        <label>过滤规则</label>
        <el-select
          :model-value="filterMode"
          @update:model-value="$emit('update:filterMode', $event)"
          placeholder="选择过滤模式"
        >
          <el-option label="无过滤" value="none" />
          <el-option label="应用 .gitignore" value="gitignore" />
          <el-option label="自定义规则" value="custom" />
          <el-option label="同时使用两者" value="both" />
        </el-select>

        <el-input
          v-if="filterMode === 'custom' || filterMode === 'both'"
          :model-value="customPattern"
          @update:model-value="$emit('update:customPattern', $event)"
          type="textarea"
          :rows="5"
          placeholder="每行一个规则，支持通配符&#10;例如: *.log&#10;node_modules/"
          class="custom-pattern-input"
        />
      </div>

      <div class="config-section">
        <label>深度限制</label>
        <div class="depth-controls">
          <div class="slider-container">
            <el-slider
              :model-value="maxDepth"
              @update:model-value="$emit('update:maxDepth', $event)"
              :min="0"
              :max="20"
              :marks="{ 0: '无限', 5: '5', 10: '10', 15: '15', 20: '20' }"
            />
          </div>
          <el-input-number
            :model-value="maxDepth"
            @update:model-value="$emit('update:maxDepth', $event)"
            :min="0"
            :max="20"
            :step="1"
            controls-position="right"
            class="depth-input"
          />
        </div>
        <div class="depth-info">当前深度: {{ maxDepth === 0 ? "无限制" : maxDepth }}</div>
      </div>
    </div>

    <div class="button-footer">
      <el-button
        type="primary"
        @click="$emit('generate')"
        :loading="isGenerating"
        :disabled="!targetPath"
        class="generate-btn"
      >
        <el-icon><Histogram /></el-icon>
        生成目录树
      </el-button>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { FolderOpened, Histogram, Clock, Delete } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import type { PathHistoryItem } from "../config";

interface Props {
  targetPath: string;
  showFiles: boolean;
  showHidden: boolean;
  filterMode: "none" | "gitignore" | "custom" | "both";
  customPattern: string;
  maxDepth: number;
  autoGenerateOnDrop: boolean;
  isGenerating: boolean;
  sortedPathHistory: PathHistoryItem[];
  formatHistoryTime: (timestamp: number) => string;
}

defineProps<Props>();

const emit = defineEmits<{
  "update:targetPath": [value: string];
  "update:showFiles": [value: boolean];
  "update:showHidden": [value: boolean];
  "update:filterMode": [value: "none" | "gitignore" | "custom" | "both"];
  "update:customPattern": [value: string];
  "update:maxDepth": [value: number];
  "update:autoGenerateOnDrop": [value: boolean];
  selectDirectory: [];
  generate: [];
  selectHistoryPath: [path: string];
  removeHistoryPath: [path: string];
  clearHistory: [];
}>();

// 处理路径拖放
const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    emit("update:targetPath", paths[0]);
    customMessage.success(`已设置目标路径: ${paths[0]}`);
  }
};

const onSelectHistoryPath = (path: string) => {
  emit("selectHistoryPath", path);
};

const onRemoveHistoryPath = (path: string) => {
  emit("removeHistoryPath", path);
};

const onClearHistory = () => {
  emit("clearHistory");
};
</script>

<style scoped>
.config-card {
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.button-footer {
  flex-shrink: 0;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.config-section {
  margin-bottom: 20px;
  padding: 4px;
}

.config-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.label-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.label-with-action label {
  margin-bottom: 0;
}

.path-input-group {
  display: flex;
  gap: 6px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.custom-pattern-input {
  margin-top: 10px;
}

.depth-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-container {
  flex: 1;
  margin: 0 6px 0 12px;
}

.depth-input {
  width: 100px;
  flex-shrink: 0;
}

.depth-info {
  text-align: center;
  margin-top: 20px;
  font-size: 13px;
  color: var(--text-color-light);
}

.generate-btn {
  width: 100%;
}

.history-menu {
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 8px;
}

.history-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.history-list {
  max-height: 350px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 8px;
}

.history-item:hover {
  background-color: var(--el-fill-color-light);
}

.history-item-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.history-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--el-color-primary);
}

.history-path {
  flex: 1;
  min-width: 0;
}

.path-text {
  font-size: 13px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.access-count {
  font-family: monospace;
}

.delete-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.history-item:hover .delete-btn {
  opacity: 1;
}
</style>
