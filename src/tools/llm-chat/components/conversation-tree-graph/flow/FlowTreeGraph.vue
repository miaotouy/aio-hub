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
      @node-drag-start="handleNodeDragStart"
      @node-drag="handleNodeDrag"
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

    <!-- 控制按钮组 -->
    <div class="control-buttons">
      <el-button-group>
        <!-- 布局模式切换按钮 -->
        <el-tooltip
          :content="layoutMode === 'tree' ? '切换到物理悬挂模式' : '切换到树状布局模式'"
          placement="bottom"
        >
          <el-button :icon="layoutMode === 'tree' ? Grid : Share" @click="toggleLayoutMode" />
        </el-tooltip>

        <!-- 调试模式切换按钮 -->
        <el-tooltip :content="debugMode ? '关闭调试模式' : '开启调试模式'" placement="bottom">
          <el-button
            :icon="View"
            :type="debugMode ? 'primary' : 'default'"
            @click="toggleDebugMode"
          />
        </el-tooltip>
      </el-button-group>
    </div>

    <!-- D3 调试可视化叠加层 -->
    <svg
      v-if="debugMode"
      ref="debugSvgRef"
      class="debug-overlay"
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
      }"
    >
      <defs>
        <marker
          id="arrowhead-debug"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#ff6b6b" />
        </marker>
      </defs>

      <!-- 绘制连线 -->
      <g class="debug-links">
        <g v-for="link in debugLinkPaths" :key="link?.id">
          <!-- 连线路径 -->
          <path
            :d="link?.path"
            stroke="#ff6b6b"
            stroke-width="2"
            fill="none"
            stroke-dasharray="5,5"
            marker-end="url(#arrowhead-debug)"
          />
          <!-- 连线信息文本 -->
          <text
            v-if="link?.midpoint"
            :x="link.midpoint.x"
            :y="link.midpoint.y"
            fill="#ffffff"
            font-size="10"
            font-family="monospace"
            text-anchor="middle"
            dominant-baseline="middle"
            class="debug-text"
          >
            {{ link.debugText }}
          </text>
        </g>
      </g>

      <!-- 绘制节点 -->
      <g class="debug-nodes">
        <g v-for="node in debugNodeRects" :key="node.id">
          <!-- 节点矩形边界 -->
          <rect
            :x="node.x"
            :y="node.y"
            :width="node.width"
            :height="node.height"
            fill="rgba(255, 107, 107, 0.1)"
            stroke="#ff6b6b"
            stroke-width="2"
            stroke-dasharray="4,4"
          />

          <!-- 节点中心点 -->
          <circle :cx="node.cx" :cy="node.cy" r="4" fill="#ff6b6b" />

          <!-- 速度向量（如果存在） -->
          <line
            v-if="Math.abs(node.vx) > 0.01 || Math.abs(node.vy) > 0.01"
            :x1="node.cx"
            :y1="node.cy"
            :x2="node.cx + node.vx * 50 * getViewport().zoom"
            :y2="node.cy + node.vy * 50 * getViewport().zoom"
            stroke="#4ecdc4"
            stroke-width="2"
            marker-end="url(#arrowhead-velocity)"
          />

          <!-- 固定点标记（如果节点被固定） -->
          <circle
            v-if="node.fx !== undefined || node.fy !== undefined"
            :cx="node.cx"
            :cy="node.cy"
            r="8"
            fill="none"
            stroke="#ffd93d"
            stroke-width="2"
          />

          <!-- 节点信息文本 -->
          <text
            :x="node.x + 4"
            :y="node.y + 14"
            fill="#ffffff"
            font-size="11"
            font-family="monospace"
            font-weight="bold"
            class="debug-text"
          >
            <tspan v-for="(line, index) in node.textLines" :key="index" :x="node.x + 4" :dy="index === 0 ? 0 : '1.2em'">
              {{ line }}
            </tspan>
          </text>

          <!-- 状态徽章 -->
          <g :transform="`translate(${node.x + node.width - 4}, ${node.y + 4})`">
            <text
              v-if="node.isActiveLeaf"
              text-anchor="end"
              font-size="10"
              fill="#ff4757"
              font-weight="bold"
            >
              ● Active
            </text>
            <text
              v-if="!node.isEnabled"
              text-anchor="end"
              font-size="10"
              fill="#7f8c8d"
              font-weight="bold"
              :y="node.isActiveLeaf ? 12 : 0"
            >
              ● Disabled
            </text>
          </g>
        </g>
      </g>

      <!-- 速度向量箭头标记 -->
      <defs>
        <marker
          id="arrowhead-velocity"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#4ecdc4" />
        </marker>
      </defs>
    </svg>

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
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import { Grid, Share, View } from "@element-plus/icons-vue";
import type { ChatSession, ChatMessageNode } from "../../../types";
import { useFlowTreeGraph } from "../../../composables/useFlowTreeGraph";
import { useAgentStore } from "../../../agentStore";
import GraphNode from "./components/GraphNode.vue";
import GraphNodeDetailPopup from "./components/GraphNodeDetailPopup.vue";
import ContextMenu from "../ContextMenu.vue";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";

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
  layoutMode,
  debugMode,
  d3Nodes,
  d3Links,
  detailPopupState,
  handleNodeDoubleClick,
  handleNodeDragStart,
  handleNodeDrag,
  handleNodeDragStop,
  handleNodeContextMenu: onNodeContextMenu,
  handleNodeCopy,
  handleNodeToggleEnabled,
  handleNodeDelete,
  handleNodeViewDetail: onNodeViewDetail,
  closeDetailPopup,
  updateChart,
  updateNodeDimensions,
  switchLayoutMode,
  toggleDebugMode,
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

// 切换布局模式
const toggleLayoutMode = () => {
  const newMode = layoutMode.value === "tree" ? "physics" : "tree";
  switchLayoutMode(newMode);
};

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

// 获取 Vue Flow 内部节点状态，用于读取渲染后的节点尺寸和视口信息
const { getNodes, getViewport } = useVueFlow();

// 监听节点尺寸变化并同步到 D3
const dimensionsWatchStop = watch(
  () => getNodes.value,
  (vueFlowNodes) => {
    const dimensionsMap = new Map<string, { width: number; height: number }>();

    vueFlowNodes.forEach((node) => {
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
  { deep: true, flush: "post" } // flush: 'post' 确保在 DOM 更新后执行
);

onUnmounted(() => {
  dimensionsWatchStop();
});

// SVG 调试层相关
const debugSvgRef = ref<SVGSVGElement | null>(null);

// 将 D3 坐标转换为 SVG 视口坐标
const transformD3ToSvg = (x: number, y: number) => {
  const viewport = getViewport();
  return {
    x: x * viewport.zoom + viewport.x,
    y: y * viewport.zoom + viewport.y,
  };
};

// 计算调试节点的矩形属性
const debugNodeRects = computed(() => {
  if (!debugMode.value) return [];
  const viewport = getViewport();
  return d3Nodes.value.map((node) => {
    const pos = transformD3ToSvg(node.x ?? 0, node.y ?? 0);

    const textLines = [
      `ID: ${node.id.slice(0, 8)} | Depth: ${node.depth}`,
      `Pos: (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`,
      `Vel: (${(node.vx ?? 0).toFixed(1)}, ${(node.vy ?? 0).toFixed(1)}) | Speed: ${(Math.sqrt((node.vx ?? 0) ** 2 + (node.vy ?? 0) ** 2) * 50).toFixed(1)}`,
      `Size: ${(node.width / viewport.zoom).toFixed(0)}x${(node.height / viewport.zoom).toFixed(0)}`,
    ];
    if (node.fx !== undefined && node.fx !== null && node.fy !== undefined && node.fy !== null) {
      textLines.push(`Fixed: (${node.fx.toFixed(0)}, ${node.fy.toFixed(0)})`);
    }

    return {
      id: node.id,
      x: pos.x - (node.width / 2) * viewport.zoom,
      y: pos.y - (node.height / 2) * viewport.zoom,
      width: node.width * viewport.zoom,
      height: node.height * viewport.zoom,
      cx: pos.x,
      cy: pos.y,
      vx: node.vx ?? 0,
      vy: node.vy ?? 0,
      fx: node.fx,
      fy: node.fy,
      depth: node.depth,
      isActiveLeaf: node.isActiveLeaf,
      isEnabled: node.isEnabled,
      textLines,
    };
  });
});

// 计算调试连线的路径
const debugLinkPaths = computed(() => {
  if (!debugMode.value) return [];
  return d3Links.value
    .map((link, index) => {
      const source =
        typeof link.source === "object"
          ? link.source
          : d3Nodes.value.find((n) => n.id === link.source);
      const target =
        typeof link.target === "object"
          ? link.target
          : d3Nodes.value.find((n) => n.id === link.target);

      if (!source || !target) return null;

      const sourcePos = transformD3ToSvg(source.x ?? 0, source.y ?? 0);
      const targetPos = transformD3ToSvg(target.x ?? 0, target.y ?? 0);

      const midpoint = {
        x: (sourcePos.x + targetPos.x) / 2,
        y: (sourcePos.y + targetPos.y) / 2,
      };

      let debugText = '';
      if ((link)._debug) {
        const debugInfo = (link)._debug;
        debugText = `str: ${debugInfo.strength}, dist: ${debugInfo.distance}`;
      }

      return {
        id: `link-${index}`,
        path: `M ${sourcePos.x} ${sourcePos.y} L ${targetPos.x} ${targetPos.y}`,
        sourceId: typeof link.source === "object" ? link.source.id : link.source,
        targetId: typeof link.target === "object" ? link.target.id : link.target,
        midpoint,
        debugText,
      };
    })
    .filter(Boolean);
});

// 监听视口变化以实时更新调试层
// Vue Flow 的 viewport 变化会自动触发依赖它的 computed 重新计算
// 这里添加一个定时器确保调试层在模拟运行时持续更新
let debugUpdateTimer: number | null = null;
watch(
  debugMode,
  (enabled) => {
    if (enabled) {
      debugUpdateTimer = window.setInterval(() => {
        // 强制触发 computed 更新
        getViewport();
      }, 50); // 每 50ms 更新一次
    } else {
      if (debugUpdateTimer !== null) {
        clearInterval(debugUpdateTimer);
        debugUpdateTimer = null;
      }
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (debugUpdateTimer !== null) {
    clearInterval(debugUpdateTimer);
  }
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

/* 控制按钮组 */
.control-buttons {
  position: absolute;
  top: 86px;
  right: 16px;
  z-index: 5;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.control-buttons :deep(.el-button-group) {
  overflow: hidden;
}

.control-buttons :deep(.el-button) {
  background-color: transparent;
  border-color: var(--border-color);
}

.control-buttons :deep(.el-button:hover) {
  background-color: var(--el-fill-color-light);
}

.dark .control-buttons :deep(.el-button-group) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* 调试叠加层 */
.debug-overlay {
  pointer-events: none;
  user-select: none;
}

.debug-overlay .debug-text {
  pointer-events: none;
  text-shadow:
    0 0 4px rgba(0, 0, 0, 1),
    0 0 8px rgba(0, 0, 0, 0.8);
  fill: white;
}
</style>
