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
      <template #node-custom="{ data, id }">
        <GraphNode
          :data="data"
          @copy="handleNodeCopy(id)"
          @toggle-enabled="handleNodeToggleEnabled(id)"
          @delete="handleNodeDelete(id)"
          @view-detail="(event: MouseEvent) => handleNodeViewDetail(id, event)"
        />
      </template>
    </VueFlow>
    
    <!-- 右键上下文菜单 -->
    <ContextMenu
      v-model:visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
    />
    
    <!-- 节点详情悬浮窗 -->
    <GraphNodeDetailPopup
      v-if="session"
      :session="session"
      :visible="detailPopupState.visible"
      :message="selectedNodeForDetail"
      :llm-think-rules="llmThinkRulesForDetail"
      :initial-position="detailPopupState.initialPosition"
      @close="closeDetailPopup"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import type { ChatSession, ChatMessageNode } from '../../../types';
import { useFlowTreeGraph } from '../../../composables/useFlowTreeGraph';
import { useAgentStore } from '../../../agentStore';
import GraphNode from './components/GraphNode.vue';
import GraphNodeDetailPopup from './components/GraphNodeDetailPopup.vue';
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
  detailPopupState,
  handleNodeDoubleClick,
  handleNodeDragStop,
  handleNodeContextMenu: onNodeContextMenu,
  handleNodeCopy,
  handleNodeToggleEnabled,
  handleNodeDelete,
  handleNodeViewDetail: onNodeViewDetail,
  closeDetailPopup,
  updateChart,
  updateNodeDimensions,
} = useFlowTreeGraph(() => props.session, contextMenu);

const agentStore = useAgentStore();

// 包装右键菜单处理器以适配 Vue Flow 的事件参数
const handleNodeContextMenu = (event: any) => {
  const mouseEvent = event.event as MouseEvent;
  onNodeContextMenu(mouseEvent, event.node.id);
};

// 包装查看详情处理器，从 GraphNode 的事件中获取 MouseEvent
const handleNodeViewDetail = (nodeId: string, event: MouseEvent) => {
  onNodeViewDetail(nodeId, event);
};

// 计算选中节点用于详情显示
const selectedNodeForDetail = computed<ChatMessageNode | null>(() => {
  if (!detailPopupState.value.nodeId || !props.session) {
    return null;
  }
  return props.session.nodes[detailPopupState.value.nodeId] || null;
});

// 计算选中节点对应的 LLM 思考规则
const llmThinkRulesForDetail = computed(() => {
  if (!selectedNodeForDetail.value) {
    return undefined;
  }
  
  const agentId = selectedNodeForDetail.value.metadata?.agentId;
  if (!agentId) {
    return undefined;
  }
  
  const agent = agentStore.getAgentById(agentId);
  return agent?.llmThinkRules;
});

// 监听 session 变化
watch(
  () => props.session,
  (newSession) => {
    // 会话内容（节点/边）发生变化时重新计算布局
    if (newSession) {
      updateChart();
    } else {
      // 会话被清空时也同步清空图数据
      updateChart();
    }
  },
  { deep: true }
);

// 组件挂载时立即更新一次图表
onMounted(() => {
  updateChart();
});

// 获取 Vue Flow 内部节点状态，用于读取渲染后的节点尺寸
const { getNodes } = useVueFlow();

// 监听节点尺寸变化并同步到 D3
const dimensionsWatchStop = watch(
  () => getNodes.value,
  (vueFlowNodes) => {
    const dimensionsMap = new Map<string, { width: number; height: number }>();
    
    vueFlowNodes.forEach(node => {
      // Vue Flow 的 node.dimensions 包含渲染后的实际尺寸
      if (node.dimensions?.width && node.dimensions?.height) {
        dimensionsMap.set(node.id, {
          width: node.dimensions.width,
          height: node.dimensions.height,
        });
      }
    });

    if (dimensionsMap.size > 0) {
      updateNodeDimensions(dimensionsMap);
    }
  },
  { deep: true, flush: 'post' } // flush: 'post' 确保在 DOM 更新后执行
);

onUnmounted(() => {
  dimensionsWatchStop();
});
</script>

<style scoped>
.flow-tree-graph-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: var(--card-bg);
  /* border-radius: 8px; */
  box-sizing: border-box;
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