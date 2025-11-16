<template>
  <div class="conversation-tree-graph-wrapper">
    <div ref="networkContainer" class="conversation-tree-graph"></div>
    
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
import { ref, onMounted, onUnmounted, watch } from "vue";
import type { ChatSession } from "../../types";
import { useVisTreeGraph } from "../../composables/useVisTreeGraph";
import ContextMenu from "./ContextMenu.vue";

/**
 * 会话树图组件
 * 使用 Vis.js 层级布局渲染对话历史的树状结构
 */

// Props
interface Props {
  session: ChatSession | null;
}

const props = defineProps<Props>();

// Refs
const networkContainer = ref<HTMLElement | null>(null);

// 上下文菜单状态
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  items: [] as any[],
});

// Composable
const { init, destroy, updateChart } = useVisTreeGraph(
  () => props.session,
  contextMenu
);

// Lifecycle
onMounted(() => {
  if (networkContainer.value) {
    init(networkContainer.value);
  }
});

onUnmounted(() => {
  destroy();
});

// Watch session changes
watch(
  () => props.session,
  () => {
    updateChart();
  },
  { deep: true }
);
</script>

<style scoped>
.conversation-tree-graph-wrapper {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
}

.conversation-tree-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background-color: var(--card-bg);
}

/* Vis.js 网络容器样式调整 */
.conversation-tree-graph :deep(.vis-network) {
  outline: none;
}

.conversation-tree-graph :deep(canvas) {
  border-radius: 8px;
}
</style>

<style>
/* Vis.js Tooltip 主题适配（全局样式，影响整个应用） */
.vis-tooltip {
  position: absolute;
  visibility: hidden;
  padding: 12px 16px !important;
  white-space: pre-wrap !important;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
  color: var(--el-text-color-regular) !important;
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
  max-width: 400px !important;
  word-break: break-word !important;
  z-index: 10000 !important;
}

/* 暗色主题下增强对比度 */
.dark .vis-tooltip {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
}
</style>
]]>