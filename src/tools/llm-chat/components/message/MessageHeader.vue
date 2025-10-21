<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessageNode } from '../../types';
import { useAgentStore } from '../../agentStore';

interface Props {
  message: ChatMessageNode;
}

const props = defineProps<Props>();

const agentStore = useAgentStore();

// 获取消息关联的智能体信息
const agent = computed(() => {
  const agentId = props.message.metadata?.agentId;
  if (!agentId) return null;
  return agentStore.getAgentById(agentId);
});

// 格式化时间
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 根据角色决定显示的名称和图标
const displayName = computed(() => {
  if (props.message.role === 'user') {
    return '你';
  } else if (props.message.role === 'assistant') {
    return agent.value?.name || '助手';
  } else {
    return '系统';
  }
});

const displayIcon = computed(() => {
  if (props.message.role === 'user') {
    return '👤';
  } else if (props.message.role === 'assistant') {
    return agent.value?.icon || '🤖';
  } else {
    return '⚙️';
  }
});
</script>

<template>
  <div class="message-header">
    <div class="header-left">
      <span class="message-icon">{{ displayIcon }}</span>
      <span class="message-name">{{ displayName }}</span>
    </div>
    <span class="message-time">{{ formatTime(message.timestamp) }}</span>
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

.message-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.message-name {
  font-weight: 600;
  color: var(--text-color);
}

.message-time {
  color: var(--text-color-light);
  font-size: 12px;
}
</style>