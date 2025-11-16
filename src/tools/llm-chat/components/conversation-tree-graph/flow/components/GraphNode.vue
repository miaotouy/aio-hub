<template>
  <div class="node-wrapper">
    <div
      :class="['graph-node', { 'active-leaf': data.isActiveLeaf, 'is-disabled': !data.isEnabled }]"
      :style="nodeStyle"
    >
      <!-- 连接点 -->
      <Handle type="target" :position="Position.Top" />
      
      <!-- 节点内容 -->
      <GraphNodeContent :data="data" />
      
      <!-- 连接点 -->
      <Handle type="source" :position="Position.Bottom" />
    </div>
    
    <!-- 悬浮操作栏 -->
    <GraphNodeMenubar
      :is-enabled="data.isEnabled"
      :is-active-leaf="data.isActiveLeaf"
      @copy="handleCopy"
      @toggle-enabled="handleToggleEnabled"
      @delete="handleDelete"
      @view-detail="handleViewDetail"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import GraphNodeContent from './GraphNodeContent.vue';
import GraphNodeMenubar from './GraphNodeMenubar.vue';

interface NodeData {
  name: string;
  avatar: string;
  contentPreview: string;
  isActiveLeaf: boolean;
  isEnabled: boolean;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  subtitleInfo: {
    profileName: string;
    profileIcon: string | undefined;
    modelName: string;
    modelIcon: string | undefined;
  } | null;
  colors: {
    background: string;
    border: string;
  };
  tokens?: {
    total: number;
    prompt?: number;
    completion?: number;
  } | null;
}

interface Props {
  data: NodeData;
}

interface Emits {
  (e: 'copy'): void;
  (e: 'toggle-enabled'): void;
  (e: 'delete'): void;
  (e: 'view-detail'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const nodeStyle = computed(() => ({
  backgroundColor: props.data.colors.background,
  borderColor: props.data.colors.border,
}));

// 事件处理
const handleCopy = () => emit('copy');
const handleToggleEnabled = () => emit('toggle-enabled');
const handleDelete = () => emit('delete');
const handleViewDetail = () => emit('view-detail');
</script>

<style scoped>
.node-wrapper {
  position: relative;
}

/* 扩大悬停触发区域 */
.node-wrapper::after {
  content: '';
  position: absolute;
  left: -8px;
  right: -8px;
  top: -8px;
  bottom: -56px; /* 覆盖到 menubar 区域 */
  pointer-events: none;
}

/* 悬停时显示操作栏 - 扩大触发区域 */
.node-wrapper:hover .graph-node-menubar,
.graph-node-menubar:hover {
  opacity: 1;
}

.graph-node {
  position: relative;
  padding: 16px;
  padding-bottom: 24px; /* 为下方的 menubar 留出空间 */
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  min-width: 200px;
  max-width: 300px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.graph-node:hover {
  border-color: var(--primary-color);
}

.graph-node.active-leaf {
  border-width: 2px;
  box-shadow: 0 0 0 2px var(--primary-color-light);
}

.graph-node.is-disabled {
  opacity: 0.5;
}

.graph-node.is-disabled :deep(.node-preview) {
  color: var(--text-color-light);
}
</style>