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
import { useConversationGraph } from "../../composables/useConversationGraph";
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
const { init, destroy, updateChart } = useConversationGraph(
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
  position: relative;
}

.conversation-tree-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background-color: var(--card-bg);
  border-radius: 8px;
}

/* Vis.js 网络容器样式调整 */
.conversation-tree-graph :deep(.vis-network) {
  outline: none;
}

.conversation-tree-graph :deep(canvas) {
  border-radius: 8px;
}
</style>
]]>