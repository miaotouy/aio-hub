<template>
  <div
    :class="['graph-node', { 'active-leaf': data.isActiveLeaf, 'disabled': !data.isEnabled }]"
    :style="nodeStyle"
  >
    <!-- 连接点 -->
    <Handle type="target" :position="Position.Top" />
    
    <!-- 节点内容 -->
    <div class="node-content">
      <!-- 头像 -->
      <Avatar
        v-if="data.avatar"
        :src="data.avatar"
        :alt="data.name"
        :size="32"
        shape="square"
        :radius="6"
      />
      
      <!-- 文本信息 -->
      <div class="node-text">
        <div class="node-header">
          <span class="node-name">{{ data.name }}</span>
          <span v-if="data.isActiveLeaf" class="active-indicator">🎯</span>
        </div>
        <div class="node-preview">{{ data.contentPreview }}</div>
      </div>
    </div>
    
    <!-- 连接点 -->
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Avatar from '@/components/common/Avatar.vue';

interface NodeData {
  name: string;
  avatar: string;
  contentPreview: string;
  isActiveLeaf: boolean;
  isEnabled: boolean;
  colors: {
    background: string;
    border: string;
  };
}

interface Props {
  data: NodeData;
}

const props = defineProps<Props>();

const nodeStyle = computed(() => ({
  backgroundColor: props.data.colors.background,
  borderColor: props.data.colors.border,
  opacity: props.data.isEnabled ? 1 : 0.7,
}));
</script>

<style scoped>
.graph-node {
  position: relative;
  padding: 12px;
  border: 2px solid;
  border-radius: 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  min-width: 200px;
  max-width: 300px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.graph-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.graph-node.active-leaf {
  border-width: 3px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.graph-node.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.node-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.node-text {
  flex: 1;
  min-width: 0;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.node-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.active-indicator {
  font-size: 12px;
}

.node-preview {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 6;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}
</style>