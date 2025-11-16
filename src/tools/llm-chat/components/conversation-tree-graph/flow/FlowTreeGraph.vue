<template>
  <div class="flow-tree-graph-wrapper">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-viewport="{ zoom: 1, x: 0, y: 0 }"
      :min-zoom="0.2"
      :max-zoom="4"
      fit-view-on-init
      @node-double-click="handleNodeDoubleClick"
      @node-drag-stop="handleNodeDragStop"
      @node-context-menu="handleNodeContextMenu"
    >
      <!-- 背景网格 -->
      <Background pattern-color="#aaa" :gap="16" />
      
      <!-- 小地图 -->
      <MiniMap />
      
      <!-- 控制器 -->
      <Controls />
      
      <!-- 自定义节点 -->
      <template #node-custom="{ data }">
        <GraphNode :data="data" />
      </template>
    </VueFlow>
    
    <!-- 右键上下文菜单 -->
    <ContextMenu
      v-model:visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import type { ChatSession } from '../../../types';
import { useFlowTreeGraph } from '../../../composables/useFlowTreeGraph';
import GraphNode from './components/GraphNode.vue';
import ContextMenu from '../ContextMenu.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

/**
 * 会话树图组件 V2
 * 使用 Vue Flow + D3.js 力导向布局渲染对话历史的树状结构
 */

interface Props {
  session: ChatSession | null;
}

const props = defineProps<Props>();

// 上下文菜单状态
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  items: [] as any[],
});

// Composable
const {
  nodes,
  edges,
  handleNodeDoubleClick,
  handleNodeDragStop,
  handleNodeContextMenu: onNodeContextMenu,
  updateChart,
} = useFlowTreeGraph(() => props.session, contextMenu);

// 包装右键菜单处理器以适配 Vue Flow 的事件参数
const handleNodeContextMenu = (event: any) => {
  const mouseEvent = event.event as MouseEvent;
  onNodeContextMenu(mouseEvent, event.node.id);
};

// 监听 session 变化
watch(
  () => props.session,
  (newSession, oldSession) => {
    // 仅在会话实际发生变化时更新，避免不必要的重绘
    if (newSession && newSession !== oldSession) {
      updateChart();
    }
  },
  { deep: true }
);

// 组件挂载时立即更新一次图表
onMounted(() => {
  updateChart();
});
</script>

<style scoped>
.flow-tree-graph-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: var(--card-bg);
  border-radius: 8px;
}

/* Vue Flow 容器样式调整 */
.flow-tree-graph-wrapper :deep(.vue-flow) {
  background-color: transparent;
}

/* 自定义控制器样式 */
.flow-tree-graph-wrapper :deep(.vue-flow__controls) {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.flow-tree-graph-wrapper :deep(.vue-flow__controls-button) {
  background-color: transparent;
  border-bottom: 1px solid var(--border-color);
  color: var(--el-text-color-primary);
}

.flow-tree-graph-wrapper :deep(.vue-flow__controls-button:hover) {
  background-color: var(--el-fill-color-light);
}

.flow-tree-graph-wrapper :deep(.vue-flow__controls-button:last-child) {
  border-bottom: none;
}

.flow-tree-graph-wrapper :deep(.vue-flow__controls-button svg) {
  fill: currentColor;
}

/* 自定义小地图样式 */
.flow-tree-graph-wrapper :deep(.vue-flow__minimap) {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.flow-tree-graph-wrapper :deep(.vue-flow__minimap-mask) {
  fill: var(--el-color-primary);
  fill-opacity: 0.2;
  stroke: var(--el-color-primary);
  stroke-width: 2;
}

/* 自定义背景样式 */
.flow-tree-graph-wrapper :deep(.vue-flow__background) {
  opacity: 0.3;
}

/* 暗色主题适配 */
.dark .flow-tree-graph-wrapper :deep(.vue-flow__controls),
.dark .flow-tree-graph-wrapper :deep(.vue-flow__minimap) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
</style>