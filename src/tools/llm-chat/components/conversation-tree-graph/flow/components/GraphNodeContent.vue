<template>
  <div class="graph-node-content">
    <!-- 节点头部 -->
    <div class="node-header">
      <Avatar
        v-if="data.avatar"
        :src="data.avatar"
        :alt="data.name"
        :size="48"
        shape="square"
        :radius="6"
      />
      <div class="node-info">
        <div class="node-name-row">
          <span class="node-name">{{ data.name }}</span>
          <span v-if="data.isActiveLeaf" class="active-indicator">🎯</span>
        </div>
        <!-- 副标题：模型和渠道信息 -->
        <div v-if="shouldShowSubtitle && data.subtitleInfo" class="node-subtitle">
          <!-- 模型信息 -->
          <div class="subtitle-item">
            <DynamicIcon
              v-if="data.subtitleInfo.modelIcon"
              :src="data.subtitleInfo.modelIcon"
              :alt="data.subtitleInfo.modelName"
              class="subtitle-icon"
            />
            <span class="subtitle-text">{{ data.subtitleInfo.modelName }}</span>
          </div>
          <!-- 分隔符 -->
          <span class="subtitle-separator">·</span>
          <!-- 渠道信息 -->
          <div class="subtitle-item">
            <DynamicIcon
              v-if="data.subtitleInfo.profileIcon"
              :src="data.subtitleInfo.profileIcon"
              :alt="data.subtitleInfo.profileName"
              class="subtitle-icon"
            />
            <span class="subtitle-text">{{ data.subtitleInfo.profileName }}</span>
          </div>
        </div>
        <!-- 时间戳和 Token 信息 -->
        <div v-if="settings.uiPreferences.showTimestamp || (settings.uiPreferences.showTokenCount && data.tokens)" class="node-meta">
          <span v-if="settings.uiPreferences.showTimestamp" class="meta-item">
            {{ formatTime(data.timestamp) }}
          </span>
          <span v-if="settings.uiPreferences.showTokenCount && data.tokens" class="meta-item">
            {{ formatTokens(data.tokens) }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- 内容预览 -->
    <div class="node-preview">{{ data.contentPreview }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '@/components/common/Avatar.vue';
import DynamicIcon from '@/components/common/DynamicIcon.vue';
import { useChatSettings } from '@/tools/llm-chat/composables/useChatSettings';

interface NodeData {
  name: string;
  avatar: string;
  contentPreview: string;
  isActiveLeaf: boolean;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  subtitleInfo: {
    profileName: string;
    profileIcon: string | undefined;
    modelName: string;
    modelIcon: string | undefined;
  } | null;
  tokens?: {
    total: number;
    prompt?: number;
    completion?: number;
  } | null;
}

interface Props {
  data: NodeData;
}

const props = defineProps<Props>();

const { settings } = useChatSettings();

// 格式化时间
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 是否显示副标题
const shouldShowSubtitle = computed(() => {
  return settings.value.uiPreferences.showModelInfo &&
         props.data.role === 'assistant' &&
         !!props.data.subtitleInfo;
});

// 格式化 Token 信息
const formatTokens = (tokens: { total: number; prompt?: number; completion?: number }) => {
  if (tokens.prompt !== undefined && tokens.completion !== undefined) {
    return `${tokens.total} tokens (${tokens.prompt}+${tokens.completion})`;
  }
  return `${tokens.total} tokens`;
};
</script>

<style scoped>
.graph-node-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 节点头部 */
.node-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.node-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.node-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1.2;
}

.active-indicator {
  font-size: 12px;
  line-height: 1;
}

.node-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.2;
  margin-top: 2px;
}

.subtitle-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.subtitle-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  flex-shrink: 0;
}

.subtitle-text {
  white-space: nowrap;
}

.subtitle-separator {
  color: var(--text-color-tertiary);
  opacity: 0.5;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.meta-item {
  color: var(--text-color-light);
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.meta-item:not(:last-child)::after {
  content: '·';
  margin-left: 8px;
  color: var(--text-color-tertiary);
  opacity: 0.5;
}

/* 内容预览 */
.node-preview {
  font-size: 13px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 4;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  line-height: 1.5;
  word-break: break-word;
}
</style>