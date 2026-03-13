<template>
  <InfoCard title="目录结构" class="result-card">
    <template #headerExtra>
      <el-button-group v-if="treeData">
        <el-tooltip v-if="statsInfo" placement="top">
          <template #content>
            <div class="stats-tooltip">
              <div class="stats-row">
                <span class="stats-label">总目录:</span>
                <span class="stats-value">{{ statsInfo.total_dirs }}</span>
              </div>
              <div class="stats-row">
                <span class="stats-label">总文件:</span>
                <span class="stats-value">{{ statsInfo.total_files }}</span>
              </div>
              <div v-if="statsInfo.filter_count > 0" class="stats-row">
                <span class="stats-label">过滤规则:</span>
                <span class="stats-value">{{ statsInfo.filter_count }} 条</span>
              </div>
            </div>
          </template>
          <el-button :icon="DataAnalysis" text circle />
        </el-tooltip>
        <el-tooltip content="复制到剪贴板" placement="top">
          <el-button :icon="CopyDocument" text circle @click="$emit('copy')" />
        </el-tooltip>
        <el-tooltip content="导出为文件" placement="top">
          <el-button :icon="Download" text circle @click="$emit('export')" />
        </el-tooltip>
        <el-tooltip content="发送到聊天" placement="top">
          <el-button :icon="ChatDotRound" text circle @click="$emit('sendToChat')" />
        </el-tooltip>
        <el-tooltip content="清空结果" placement="top">
          <el-button :icon="Delete" text circle @click="$emit('reset')" />
        </el-tooltip>
      </el-button-group>
    </template>

    <div v-if="treeData" class="filter-section">
      <div class="filter-header" @click="toggleFilter">
        <div class="filter-title">
          <el-icon><Filter /></el-icon>
          <span>视图控制与筛选</span>
        </div>
        <el-icon class="expand-icon" :class="{ 'is-expanded': showResultFilter }">
          <ArrowRight />
        </el-icon>
      </div>

      <el-collapse-transition>
        <div v-show="showResultFilter" class="result-controls">
          <div class="control-row">
            <span class="control-label">显示深度:</span>
            <el-slider
              :model-value="secondaryMaxDepth"
              @update:model-value="$emit('update:secondaryMaxDepth', $event)"
              :min="1"
              :max="actualMaxDepth"
              :step="1"
              show-stops
              size="small"
              class="depth-slider"
            />
            <span class="depth-value">{{ secondaryMaxDepth }} / {{ actualMaxDepth }}</span>
          </div>
          <div class="control-row">
            <span class="control-label">包含路径:</span>
            <el-input
              :model-value="secondaryIncludePath"
              @update:model-value="$emit('update:secondaryIncludePath', $event)"
              placeholder="只展示此子路径下的内容 (如 src/components)"
              size="small"
              clearable
              class="filter-input"
            />
          </div>
          <div class="control-row">
            <span class="control-label">排除内容:</span>
            <el-input
              :model-value="secondaryExcludePattern"
              @update:model-value="$emit('update:secondaryExcludePattern', $event)"
              placeholder="输入关键词隐藏行（及子项）"
              size="small"
              clearable
              class="filter-input"
            />
          </div>
          <div class="control-row">
            <span class="control-label">显示选项:</span>
            <div class="checkbox-group-inline">
              <el-checkbox
                :model-value="viewShowFiles"
                @update:model-value="$emit('update:viewShowFiles', $event)"
                size="small"
              >
                显示文件
              </el-checkbox>
              <el-checkbox
                :model-value="includeMetadata"
                @update:model-value="$emit('update:includeMetadata', $event)"
                size="small"
              >
                统计信息
              </el-checkbox>
              <el-checkbox
                :model-value="includeFilterInfo"
                @update:model-value="$emit('update:includeFilterInfo', $event)"
                size="small"
                :disabled="!includeMetadata"
              >
                筛选信息
              </el-checkbox>
              <el-checkbox :model-value="showSize" @update:model-value="$emit('update:showSize', $event)" size="small">
                文件大小
              </el-checkbox>
              <el-checkbox
                :model-value="showDirSize"
                @update:model-value="$emit('update:showDirSize', $event)"
                size="small"
              >
                目录大小
              </el-checkbox>
              <el-checkbox
                :model-value="showDirItemCount"
                @update:model-value="$emit('update:showDirItemCount', $event)"
                size="small"
              >
                目录项数
              </el-checkbox>
            </div>
          </div>
        </div>
      </el-collapse-transition>
    </div>

    <div v-if="!treeData" class="empty-state">
      <el-empty description="选择目录并生成目录树" />
    </div>

    <div v-else class="tree-editor-container">
      <RichCodeEditor
        :model-value="editorContent"
        @update:model-value="$emit('update:editorContent', $event)"
        language="markdown"
        :line-numbers="true"
        :read-only="false"
        editor-type="codemirror"
      />
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import {
  CopyDocument,
  Download,
  DataAnalysis,
  ChatDotRound,
  Filter,
  Delete,
  ArrowRight,
} from "@element-plus/icons-vue";
import InfoCard from "@components/common/InfoCard.vue";
import RichCodeEditor from "@components/common/RichCodeEditor.vue";
import type { TreeNode, TreeStats } from "../config";

interface Props {
  treeData: TreeNode | null;
  statsInfo: TreeStats | null;
  showResultFilter: boolean;
  secondaryMaxDepth: number;
  actualMaxDepth: number;
  secondaryIncludePath: string;
  secondaryExcludePattern: string;
  viewShowFiles: boolean;
  includeMetadata: boolean;
  includeFilterInfo: boolean;
  showSize: boolean;
  showDirSize: boolean;
  showDirItemCount: boolean;
  editorContent: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:showResultFilter": [value: boolean];
  "update:secondaryMaxDepth": [value: number];
  "update:secondaryIncludePath": [value: string];
  "update:secondaryExcludePattern": [value: string];
  "update:viewShowFiles": [value: boolean];
  "update:includeMetadata": [value: boolean];
  "update:includeFilterInfo": [value: boolean];
  "update:showSize": [value: boolean];
  "update:showDirSize": [value: boolean];
  "update:showDirItemCount": [value: boolean];
  "update:editorContent": [value: string];
  copy: [];
  export: [];
  sendToChat: [];
  reset: [];
}>();

const toggleFilter = () => {
  emit("update:showResultFilter", !props.showResultFilter);
};
</script>

<style scoped>
.result-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tree-editor-container {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  margin: 8px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tree-editor-container :deep(.rich-code-editor-wrapper) {
  height: 100%;
  border-radius: 8px;
}

.tree-editor-container :deep(.cm-editor) {
  font-size: 13px;
  line-height: 1.6;
}

.tree-editor-container :deep(.cm-content) {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
}

.stats-tooltip {
  padding: 4px 0;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
  font-size: 13px;
}

.stats-label {
  font-weight: 500;
}

.stats-value {
  font-weight: 600;
  font-family: "Consolas", "Monaco", monospace;
}

.filter-section {
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  margin: 8px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  background-color: var(--el-fill-color-light);
  transition: background-color 0.2s;
  user-select: none;
}

.filter-header:hover {
  background-color: var(--el-fill-color);
}

.filter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.expand-icon {
  transition: transform 0.3s;
  color: var(--text-color-secondary);
}

.expand-icon.is-expanded {
  transform: rotate(90deg);
}

.result-controls {
  padding: 12px 16px;
  background-color: var(--el-fill-color-lighter);
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.checkbox-group-inline {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-label {
  color: var(--text-color-secondary);
  white-space: nowrap;
  min-width: 60px;
}

.depth-slider {
  flex: 1;
  margin-right: 12px;
}

.depth-value {
  font-family: monospace;
  min-width: 40px;
  text-align: right;
  color: var(--text-color);
}

.filter-input {
  flex: 1;
}
</style>
