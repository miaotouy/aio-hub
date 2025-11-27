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
              :src="data.subtitleInfo.modelIcon || ''"
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
              :src="data.subtitleInfo.profileIcon || ''"
              :alt="data.subtitleInfo.profileName"
              class="subtitle-icon"
            />
            <span class="subtitle-text">{{ data.subtitleInfo.profileName }}</span>
          </div>
        </div>
        <!-- 时间戳和 Token 信息 -->
        <div v-if="settings.uiPreferences.showTimestamp || (settings.uiPreferences.showTokenCount && data.tokens)" class="node-meta">
          <span v-if="settings.uiPreferences.showTimestamp" class="meta-item">
            {{ formatRelativeTime(data.timestamp) }}
          </span>
          <span v-if="settings.uiPreferences.showTokenCount && data.tokens" class="meta-item">
            {{ formatTokens(data.tokens) }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- 内容预览 -->
    <div class="node-preview">
      {{ data.contentPreview }}
      <!-- 生成中指示器 -->
      <div v-if="data.status === 'generating'" class="streaming-indicator">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>

    <!-- 附件列表 -->
    <div v-if="data.attachments && data.attachments.length > 0" class="node-attachments">
      <AttachmentCard
        v-for="asset in data.attachments"
        :key="asset.id"
        :asset="asset"
        size="extra-large"
        :removable="false"
        :all-assets="data.attachments"
        class="mini-attachment-card"
      />
    </div>

    <!-- 错误信息 -->
    <div v-if="data.errorMessage" class="error-info">
      <el-button
        @click="copyError"
        class="error-copy-btn"
        :class="{ copied: errorCopied }"
        :title="errorCopied ? '已复制' : '复制错误信息'"
        :icon="errorCopied ? Check : Copy"
        size="small"
        text
      />
      <span class="error-text">{{ truncateError(data.errorMessage) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Copy, Check } from 'lucide-vue-next';
import Avatar from '@/components/common/Avatar.vue';
import DynamicIcon from '@/components/common/DynamicIcon.vue';
import AttachmentCard from '@/tools/llm-chat/components/AttachmentCard.vue';
import type { Asset } from '@/types/asset-management';
import { useChatSettings } from '@/tools/llm-chat/composables/useChatSettings';
import { customMessage } from '@/utils/customMessage';
import { formatRelativeTime } from '@/utils/time';

interface NodeData {
  name: string;
  avatar: string;
  contentPreview: string;
  isActiveLeaf: boolean;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  status: 'generating' | 'complete' | 'error';
  errorMessage?: string;
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
  attachments?: Asset[];
}

interface Props {
  data: NodeData;
}

const props = defineProps<Props>();

const { settings } = useChatSettings();

// 错误信息复制状态
const errorCopied = ref(false);

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

// 截断错误信息
const truncateError = (error: string, maxLength: number = 100): string => {
  if (error.length <= maxLength) return error;
  return error.substring(0, maxLength) + '...';
};

// 复制错误信息
const copyError = async () => {
  if (!props.data.errorMessage) return;

  try {
    await navigator.clipboard.writeText(props.data.errorMessage);
    errorCopied.value = true;
    customMessage.success('错误信息已复制');

    // 2秒后重置复制状态
    setTimeout(() => {
      errorCopied.value = false;
    }, 2000);
  } catch (err) {
    customMessage.error('复制失败');
  }
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
  line-clamp: 6;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  line-height: 1.5;
  word-break: break-word;
}

/* 生成中指示器 */
.streaming-indicator {
  display: inline-flex;
  gap: 3px;
  margin-left: 4px;
  vertical-align: middle;
}

.streaming-indicator .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary-color);
  animation: pulse 1.4s infinite ease-in-out;
}

.streaming-indicator .dot:nth-child(2) {
  animation-delay: -0.16s;
}

/* 附件列表样式 */
.node-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

/* 调整附件卡片在节点中的样式 */
.mini-attachment-card {
  /* 覆盖默认宽度，使其在节点中更紧凑 */
  max-width: 100%;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 错误信息 */
.error-info {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  background-color: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.1);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-danger, #f56c6c);
}

.error-copy-btn {
  flex-shrink: 0;
  padding: 2px;
  min-height: auto;
  height: auto;
}

.error-copy-btn.copied {
  color: var(--success-color, #67c23a);
}

.error-text {
  flex: 1;
  color: var(--el-color-danger, #f56c6c);
  font-size: 11px;
  line-height: 1.4;
  word-break: break-word;
}
</style>