<template>
  <div
    class="config-item"
    :class="{
      disabled: config.enabled === false,
      'is-grid': viewMode === 'grid',
      'is-list': viewMode === 'list',
    }"
  >
    <DynamicIcon
      class="config-icon"
      :src="getDisplayIconPath(config.properties?.icon || '')"
      :alt="config.matchValue"
    />

    <div class="config-info">
      <div class="config-header">
        <el-tag
          :type="getMatchTypeTagType(config.matchType)"
          effect="plain"
          size="small"
        >
          {{ getMatchTypeLabel(config.matchType) }}
        </el-tag>
        <el-tag
          v-if="config.useRegex"
          type="success"
          effect="plain"
          size="small"
          title="使用正则表达式"
        >
          RegEx
        </el-tag>
        <span class="config-value">{{ config.matchValue }}</span>
      </div>
      <div v-if="config.properties?.group" class="config-group">
        分组: {{ config.properties.group }}
      </div>
      <div v-if="config.priority" class="config-priority">
        优先级: {{ config.priority }}
      </div>
      <div v-if="config.description" class="config-description">
        {{ config.description }}
      </div>
      <div class="config-path" :title="config.properties?.icon">
        {{ config.properties?.icon }}
      </div>
    </div>

    <div
      v-if="config.createdAt"
      class="config-created-date"
      :title="`创建于 ${formatDateTime(config.createdAt)}`"
    >
      {{ formatDate(config.createdAt) }}
    </div>

    <div class="config-actions">
      <el-button
        text
        circle
        @click="$emit('toggle', config.id)"
        :title="config.enabled === false ? '启用' : '禁用'"
      >
        <el-icon>
          <Select v-if="config.enabled !== false" />
          <Close v-else />
        </el-icon>
      </el-button>
      <el-button text circle @click="$emit('edit', config)" title="编辑">
        <el-icon>
          <Edit />
        </el-icon>
      </el-button>
      <el-button
        text
        circle
        type="danger"
        @click="$emit('delete', config.id)"
        title="删除"
      >
        <el-icon>
          <Delete />
        </el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModelMetadata } from "@composables/useModelMetadata";
import { formatDateTime } from "@/utils/time";
import type {
  ModelMetadataRule,
  MetadataMatchType,
} from "../../../../types/model-metadata";
import { Edit, Delete, Select, Close } from "@element-plus/icons-vue";
import DynamicIcon from "@components/common/DynamicIcon.vue";

defineProps<{
  config: ModelMetadataRule;
  viewMode: "grid" | "list";
}>();

defineEmits<{
  (e: "toggle", id: string): void;
  (e: "edit", config: ModelMetadataRule): void;
  (e: "delete", id: string): void;
}>();

const { getDisplayIconPath } = useModelMetadata();

// 获取匹配类型标签
function getMatchTypeLabel(type: MetadataMatchType): string {
  const labels: Record<MetadataMatchType, string> = {
    provider: "Provider",
    model: "Model",
    modelPrefix: "Prefix",
    modelGroup: "Group",
  };
  return labels[type] || type;
}

// 获取匹配类型的标签类型
function getMatchTypeTagType(
  type: MetadataMatchType
): "" | "success" | "info" | "warning" | "danger" {
  const types: Record<
    MetadataMatchType,
    "" | "success" | "info" | "warning" | "danger"
  > = {
    provider: "",
    model: "info",
    modelPrefix: "warning",
    modelGroup: "success",
  };
  return types[type] || "";
}

// 格式化日期（简短格式）
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return "今天";
  } else if (diffInDays === 1) {
    return "昨天";
  } else if (diffInDays < 7) {
    return `${diffInDays}天前`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks}周前`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return `${months}月前`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return `${years}年前`;
  }
}
</script>

<style scoped>
.config-item {
  background: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
  backdrop-filter: blur(var(--ui-blur));
}

.config-item.disabled {
  opacity: 0.5;
}

.config-item:hover {
  border-color: var(--primary-color);
}

.config-icon {
  border-radius: 4px;
  flex-shrink: 0;
}

.config-info {
  flex: 1;
  min-width: 0;
}

.config-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}

.config-value {
  font-weight: 500;
  font-family: "Consolas", "Monaco", monospace;
  word-break: break-all;
}

.config-group {
  font-size: 0.85rem;
  color: var(--primary-color);
  font-weight: 500;
}

.config-priority {
  font-size: 0.85rem;
  color: var(--text-color-light);
}

.config-description {
  font-size: 0.85rem;
  color: var(--text-color-light);
  margin-bottom: 0.25rem;
}

.config-path {
  font-size: 0.75rem;
  color: var(--text-color-light);
  font-family: "Consolas", "Monaco", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-created-date {
  font-size: 0.75rem;
  color: var(--text-color-light);
  white-space: nowrap;
  opacity: 0.7;
}

.config-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.config-actions .el-button {
  margin: 0;
}

/* 网格视图特有样式 */
.config-item.is-grid {
  display: grid;
  grid-template-columns: auto 1fr; /* Icon and content */
  grid-template-rows: 1fr auto; /* Info and actions */
  grid-template-areas:
    "icon info"
    "icon actions";
  gap: 0.5rem 1rem; /* row-gap column-gap */
  padding: 1rem;
  border-radius: 12px;
  align-items: center;
}

.config-item.is-grid .config-icon {
  grid-area: icon;
  width: 64px;
  height: 64px;
  margin: 0;
}

.config-item.is-grid .config-info {
  grid-area: info;
  text-align: left;
}

.config-item.is-grid .config-header {
  margin-bottom: 0.5rem;
}

.config-item.is-grid .config-created-date {
  grid-area: actions;
  justify-self: start;
  align-self: center;
  margin-right: auto;
}

.config-item.is-grid .config-actions {
  grid-area: actions;
  justify-content: flex-end;
  margin-top: 0;
}

/* 列表视图特有样式 */
.config-item.is-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 4px;
}

.config-item.is-list .config-icon {
  width: 40px;
  height: 40px;
}
</style>
