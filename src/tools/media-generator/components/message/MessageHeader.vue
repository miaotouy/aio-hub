<script setup lang="ts">
import { computed } from "vue";
import type { MediaMessage } from "../../types";
import { useModelMetadata } from "@/composables/useModelMetadata";
import Avatar from "@/components/common/Avatar.vue";
import { Bot } from "lucide-vue-next";
import { format } from "date-fns";

interface Props {
  message: MediaMessage;
}

const props = defineProps<Props>();

const { getIconPath, getDisplayIconPath } = useModelMetadata();

const getTypeLabel = (type: string) => {
  switch (type) {
    case "image":
      return "图像生成";
    case "video":
      return "视频生成";
    case "audio":
      return "音频生成";
    default:
      return "生成助手";
  }
};

const displayName = computed(() => {
  if (props.message.role === "user") return "你";
  const task = props.message.metadata?.taskSnapshot;
  return task ? getTypeLabel(task.type) : "生成助手";
});

const displayTimestamp = computed(() => {
  const ts = props.message.timestamp;
  if (!ts) return new Date();
  return typeof ts === "string" ? new Date(ts) : new Date(ts);
});

const modelIcon = computed(() => {
  const modelId = props.message.metadata?.modelId;
  if (!modelId) return null;
  const iconPath = getIconPath(modelId);
  return iconPath ? getDisplayIconPath(iconPath) : null;
});
</script>

<template>
  <div class="message-header">
    <div class="header-left">
      <Avatar
        src=""
        :size="40"
        :alt="message.role === 'user' ? 'User' : 'AI'"
        shape="square"
        :radius="6"
        class="avatar"
      >
        <template v-if="message.role === 'assistant'" #default>
          <Bot :size="20" />
        </template>
      </Avatar>
      <div class="message-info">
        <span class="message-name">{{ displayName }}</span>
        <div v-if="modelIcon" class="message-subtitle">
          <div class="subtitle-item">
            <img :src="modelIcon" class="subtitle-icon" />
            <span class="subtitle-text">{{ message.metadata?.modelDisplayName || message.metadata?.modelId }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="header-right">
      <span class="message-time">{{ format(displayTimestamp, "HH:mm:ss") }}</span>
    </div>
  </div>
</template>

<style scoped>
.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1.2;
}

.message-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.2;
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

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.performance-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-tertiary);
  background-color: var(--bg-color-soft);
  padding: 2px 6px;
  border-radius: 4px;
}

.stat-item {
  white-space: nowrap;
}

.stat-item:not(:last-child)::after {
  content: "|";
  margin-left: 6px;
  opacity: 0.3;
}

.message-time {
  color: var(--text-color-light);
  font-size: 12px;
  flex-shrink: 0;
}
</style>
