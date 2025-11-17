<template>
  <div ref="wrapperRef" class="flow-tree-graph-wrapper" tabindex="0" style="outline: none">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :default-viewport="{ zoom: 1, x: 0, y: 0 }"
      :min-zoom="0.2"
      :max-zoom="4"
      fit-view-on-init
      @connect="handleEdgeConnect"
      @connect-start="handleConnectionStart"
      @connect-end="handleConnectionEnd"
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
          :is-connecting="connectionPreviewState.isConnecting"
          :is-target="connectionPreviewState.targetNodeId === id"
          :is-target-valid="connectionPreviewState.isTargetValid"
          @copy="handleNodeCopy(id)"
          @toggle-enabled="handleNodeToggleEnabled(id)"
          @delete="handleNodeDelete(id)"
          @view-detail="(event: MouseEvent) => handleNodeViewDetail(id, event)"
          @mouseenter="handleNodeMouseEnter(id)"
          @mouseleave="handleNodeMouseLeave()"
        />
      </template>

      <!-- 自定义连接线 -->
      <template #connection-line="props">
        <CustomConnectionLine v-bind="props" :connection-state="connectionPreviewState" />
      </template>
    </VueFlow>

    <!-- 控制按钮组 -->
    <div class="control-buttons">
      <el-button-group style="border-radius: 8px">
        <!-- 布局模式切换按钮 -->
        <el-tooltip
          :content="layoutMode === 'tree' ? '切换到实时力导向图模式' : '切换到树状布局模式'"
          placement="bottom"
        >
          <el-button :icon="layoutMode === 'tree' ? Grid : Share" @click="toggleLayoutMode" />
        </el-tooltip>

        <!-- 重置布局按钮 -->
        <el-tooltip content="重置布局" placement="bottom">
          <el-button :icon="Refresh" @click="resetLayout" />
        </el-tooltip>

        <!-- 撤销按钮 -->
        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom">
          <el-button :icon="ArrowLeft" :disabled="!canUndo" @click="undo" />
        </el-tooltip>

        <!-- 重做按钮 -->
        <el-tooltip content="重做 (Ctrl+Shift+Z / Ctrl+Y)" placement="bottom">
          <el-button :icon="ArrowRight" :disabled="!canRedo" @click="redo" />
        </el-tooltip>

        <!-- 历史记录按钮 -->
        <el-tooltip content="查看操作历史" placement="bottom">
          <el-button
            :icon="Timer"
            :type="historyPanelState.visible ? 'primary' : 'default'"
            @click="toggleHistoryPanel"
          />
        </el-tooltip>

        <!-- 使用说明按钮 -->
        <el-tooltip content="使用说明" placement="bottom">
          <el-button :icon="QuestionFilled" @click="isUsageGuideVisible = true" />
        </el-tooltip>

        <!-- 调试模式切换按钮 -->
        <el-tooltip :content="debugMode ? '关闭调试模式' : '开启调试模式'" placement="bottom">
          <el-button
            :icon="View"
            :type="debugMode ? 'primary' : 'default'"
            @click="toggleDebugMode"
          />
        </el-tooltip>

        <!-- 复制调试信息按钮 -->
        <el-tooltip v-if="debugMode" content="复制调试信息到剪贴板" placement="bottom">
          <el-button :icon="CopyDocument" @click="copyDebugInfo" />
        </el-tooltip>
      </el-button-group>
    </div>

    <!-- 使用说明弹窗 -->
    <GraphUsageGuideDialog v-model:visible="isUsageGuideVisible" />

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
        zIndex: 10,
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
          <polygon points="0 0, 10 3.5, 0 7" class="debug-link-arrow" />
        </marker>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- 绘制连线 -->
      <g class="debug-links">
        <g v-for="link in debugLinkPaths" :key="link?.id">
          <path :d="link?.path" class="debug-link-path" marker-end="url(#arrowhead-debug)" />
          <text
            v-if="link?.midpoint"
            :x="link.midpoint.x"
            :y="link.midpoint.y"
            class="debug-text debug-link-text"
          >
            {{ link.debugText }}
          </text>
        </g>
      </g>

      <!-- 绘制节点 -->
      <g class="debug-nodes">
        <g v-for="node in debugNodeRects" :key="node.id">
          <rect
            :x="node.x"
            :y="node.y"
            :width="node.width"
            :height="node.height"
            class="debug-node-rect"
          />
          <circle :cx="node.cx" :cy="node.cy" r="4" class="debug-node-center" />
          <line
            v-if="Math.abs(node.vx) > 0.01 || Math.abs(node.vy) > 0.01"
            :x1="node.cx"
            :y1="node.cy"
            :x2="node.cx + node.vx * 50 * getViewport().zoom"
            :y2="node.cy + node.vy * 50 * getViewport().zoom"
            class="debug-velocity-vector"
            marker-end="url(#arrowhead-velocity)"
          />
          <circle
            v-if="node.fx !== undefined || node.fy !== undefined"
            :cx="node.cx"
            :cy="node.cy"
            r="8"
            class="debug-fixed-marker"
          />

          <!-- 节点信息文本背景 -->
          <rect
            :x="node.x + 2"
            :y="node.y + 4"
            :width="150"
            :height="node.textLines.length * 14 + 2"
            class="debug-text-bg"
          />
          <!-- 节点信息文本 -->
          <text :x="node.x + 4" :y="node.y + 14" class="debug-text debug-node-text">
            <tspan
              v-for="(line, index) in node.textLines"
              :key="index"
              :x="node.x + 4"
              :dy="index === 0 ? 0 : '1.2em'"
            >
              {{ line }}
            </tspan>
          </text>

          <!-- 状态徽章 -->
          <g :transform="`translate(${node.x + node.width - 4}, ${node.y + 4})`">
            <g v-if="node.isActiveLeaf">
              <rect x="-40" y="-2" width="40" height="14" rx="4" class="debug-badge-bg-active" />
              <text text-anchor="end" y="8" class="debug-badge-text-active">● Active</text>
            </g>
            <g v-if="!node.isEnabled" :transform="`translate(0, ${node.isActiveLeaf ? 16 : 0})`">
              <rect x="-50" y="-2" width="50" height="14" rx="4" class="debug-badge-bg-disabled" />
              <text text-anchor="end" y="8" class="debug-badge-text-disabled">● Disabled</text>
            </g>
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
          <polygon points="0 0, 8 3, 0 6" class="debug-velocity-arrow" />
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

    <!-- 历史记录悬浮窗 -->
    <div
      v-if="historyPanelState.visible"
      class="history-panel-container"
      :style="{
        position: 'fixed',
        top: `${historyPanelState.y}px`,
        left: `${historyPanelState.x}px`,
      }"
    >
      <HistoryPanel
        :history-stack="historyStack"
        :current-index="currentHistoryIndex"
        @jump-to="handleJumpToHistory"
        @close="closeHistoryPanel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { storeToRefs } from "pinia";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import {
  Grid,
  Share,
  View,
  CopyDocument,
  Refresh,
  QuestionFilled,
  ArrowLeft,
  ArrowRight,
  Timer,
} from "@element-plus/icons-vue";
import customMessage from "@/utils/customMessage";
import type { ChatSession, ChatMessageNode } from "../../../types";
import { useFlowTreeGraph } from "../../../composables/useFlowTreeGraph";
import { useLlmChatStore } from "../../../store";
import { useAgentStore } from "../../../agentStore";
import GraphNode from "./components/GraphNode.vue";
import GraphNodeDetailPopup from "./components/GraphNodeDetailPopup.vue";
import CustomConnectionLine from "./components/CustomConnectionLine.vue";
import ContextMenu from "../ContextMenu.vue";
import GraphUsageGuideDialog from "./components/GraphUsageGuideDialog.vue";
import HistoryPanel from "./components/HistoryPanel.vue";
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

const wrapperRef = ref<HTMLDivElement | null>(null);

// 使用说明弹窗状态
const isUsageGuideVisible = ref(false);

// 历史记录面板状态
const historyPanelState = ref({
  visible: false,
  x: 0,
  y: 0,
});

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
  connectionPreviewState,
  handleNodeDoubleClick,
  handleNodeDragStart,
  handleNodeDrag,
  handleNodeDragStop,
  handleNodeContextMenu: onNodeContextMenu,
  handleNodeCopy,
  handleNodeToggleEnabled,
  handleNodeDelete,
  handleNodeViewDetail: onNodeViewDetail,
  handleEdgeConnect,
  handleConnectionStart,
  handleConnectionEnd,
  handleNodeMouseEnter,
  handleNodeMouseLeave,
  closeDetailPopup,
  updateChart,
  updateNodeDimensions,
  switchLayoutMode,
  toggleDebugMode,
  resetLayout,
} = useFlowTreeGraph(() => props.session, contextMenu, wrapperRef);

const agentStore = useAgentStore();
const llmChatStore = useLlmChatStore();

// 从 store 中获取历史记录相关的功能和状态
// 使用 storeToRefs 来保持 canUndo 和 canRedo 的响应性
const { canUndo, canRedo } = storeToRefs(llmChatStore);
const { undo, redo, jumpToHistory } = llmChatStore;

// 获取历史记录堆栈和当前索引
const historyStack = computed(() => props.session?.history ?? []);
const currentHistoryIndex = computed(() => props.session?.historyIndex ?? 0);

// 关闭历史记录面板
const closeHistoryPanel = () => {
  historyPanelState.value.visible = false;
};

// 切换历史记录面板的显示/隐藏
const toggleHistoryPanel = (event: MouseEvent) => {
  if (historyPanelState.value.visible) {
    closeHistoryPanel();
  } else {
    const buttonGroupEl = (event.currentTarget as HTMLElement).closest(".el-button-group");
    if (!buttonGroupEl) return;

    const rect = buttonGroupEl.getBoundingClientRect();
    // 380 是面板宽度, 将面板的右边缘与按钮组的右边缘对齐
    historyPanelState.value.x = rect.right - 380;
    // 将面板放置在按钮组下方，并留出 8px 间距
    historyPanelState.value.y = rect.bottom + 8;
    historyPanelState.value.visible = true;
  }
};

// 处理历史跳转
const handleJumpToHistory = (index: number) => {
  if (!props.session) return;

  jumpToHistory(index);

  // 关闭面板
  closeHistoryPanel();
};

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

// 复制调试信息
const copyDebugInfo = () => {
  if (!debugMode.value) {
    return;
  }

  try {
    const viewport = getViewport();

    // 收集节点信息
    const nodesInfo = debugNodeRects.value.map((node) => {
      const d3Node = d3Nodes.value.find((n) => n.id === node.id);
      return {
        id: node.id,
        depth: node.depth,
        position: {
          x: (d3Node?.x ?? 0).toFixed(2),
          y: (d3Node?.y ?? 0).toFixed(2),
          screenX: node.x.toFixed(2),
          screenY: node.y.toFixed(2),
        },
        velocity: {
          vx: (d3Node?.vx ?? 0).toFixed(3),
          vy: (d3Node?.vy ?? 0).toFixed(3),
          speed: (Math.sqrt((d3Node?.vx ?? 0) ** 2 + (d3Node?.vy ?? 0) ** 2) * 50).toFixed(2),
        },
        size: {
          width: (d3Node?.width ?? 0).toFixed(0),
          height: (d3Node?.height ?? 0).toFixed(0),
        },
        fixed:
          d3Node?.fx !== undefined &&
          d3Node?.fx !== null &&
          d3Node?.fy !== undefined &&
          d3Node?.fy !== null
            ? { fx: d3Node.fx.toFixed(2), fy: d3Node.fy.toFixed(2) }
            : null,
        state: {
          isActiveLeaf: node.isActiveLeaf,
          isEnabled: node.isEnabled,
        },
      };
    });

    // 收集连线信息
    const linksInfo = debugLinkPaths.value
      .filter((link) => link !== null)
      .map((link) => {
        const d3Link = d3Links.value.find(
          (l) =>
            (typeof l.source === "object" ? l.source.id : l.source) === link?.sourceId &&
            (typeof l.target === "object" ? l.target.id : l.target) === link?.targetId
        );

        return {
          source: link?.sourceId.slice(0, 8),
          target: link?.targetId.slice(0, 8),
          debug: (d3Link as any)?._debug || null,
        };
      });

    // 构建完整的调试信息对象
    const debugInfo = {
      timestamp: new Date().toISOString(),
      layoutMode: layoutMode.value,
      viewport: {
        zoom: viewport.zoom.toFixed(3),
        x: viewport.x.toFixed(2),
        y: viewport.y.toFixed(2),
      },
      statistics: {
        totalNodes: nodesInfo.length,
        totalLinks: linksInfo.length,
        activeLeaves: nodesInfo.filter((n) => n.state.isActiveLeaf).length,
        disabledNodes: nodesInfo.filter((n) => !n.state.isEnabled).length,
        fixedNodes: nodesInfo.filter((n) => n.fixed !== null).length,
      },
      nodes: nodesInfo,
      links: linksInfo,
    };

    // 复制到剪贴板
    const jsonString = JSON.stringify(debugInfo, null, 2);
    navigator.clipboard.writeText(jsonString).then(
      () => {
        customMessage.success(
          `已复制调试信息 (${nodesInfo.length} 节点, ${linksInfo.length} 连线)`
        );
      },
      (err) => {
        console.error("复制失败:", err);
        customMessage.error("复制失败，请查看控制台");
      }
    );
  } catch (error) {
    console.error("生成调试信息时出错:", error);
    customMessage.error("生成调试信息失败");
  }
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
      `Size: ${node.width.toFixed(0)}x${node.height.toFixed(0)}`,
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

      let debugText = "";
      if (link._debug) {
        const debugInfo = link._debug;
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
  z-index: 50;
  display: flex;
  gap: 8px;
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  border-color: var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.control-buttons :deep(.el-button) {
  background-color: transparent;
  border-color: transparent;
}

.control-buttons :deep(.el-button:hover) {
  background-color: var(--el-fill-color-light);
}

.dark .control-buttons :deep(.el-button-group) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.history-panel-container {
  width: 380px;
  z-index: 2000;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  border: 1px solid var(--border-color);
  overflow: hidden;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

/* 调试叠加层 */
.debug-overlay {
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
}

.debug-overlay .debug-text {
  font-family: "Cascadia Code", "Fira Code", monospace;
  font-size: 10px;
  fill: #e0e0e0;
  paint-order: stroke;
  stroke: #1a1a1a;
  stroke-width: 2px;
  stroke-linejoin: round;
}

.debug-overlay .debug-link-text {
  font-weight: bold;
  fill: #f0f0f0;
}

.debug-overlay .debug-node-text {
  font-size: 11px;
  font-weight: 500;
}

.debug-text-bg {
  fill: rgba(26, 26, 26, 0.6);
  backdrop-filter: blur(2px);
  rx: 3px;
}

.debug-link-path {
  stroke: var(--el-color-danger);
  stroke-width: 1.5;
  fill: none;
  stroke-dasharray: 4, 4;
  opacity: 0.7;
}

.debug-link-arrow {
  fill: var(--el-color-danger);
}

.debug-node-rect {
  fill: rgba(var(--el-color-danger-rgb), 0.08);
  stroke: var(--el-color-danger);
  stroke-width: 1.5;
  stroke-dasharray: 3, 3;
  rx: 4px;
}

.debug-node-center {
  fill: var(--el-color-danger);
  filter: url(#glow);
}

.debug-velocity-vector {
  stroke: var(--el-color-success);
  stroke-width: 2;
  opacity: 0.8;
}

.debug-velocity-arrow {
  fill: var(--el-color-success);
}

.debug-fixed-marker {
  fill: none;
  stroke: var(--el-color-warning);
  stroke-width: 2.5;
  stroke-dasharray: 5, 2;
}

/* 状态徽章样式 */
.debug-badge-bg-active {
  fill: rgba(var(--el-color-error-rgb), 0.7);
}
.debug-badge-text-active {
  fill: white;
  font-size: 10px;
  font-weight: bold;
  text-anchor: end;
}
.debug-badge-bg-disabled {
  fill: rgba(128, 128, 128, 0.7);
}
.debug-badge-text-disabled {
  fill: #e0e0e0;
  font-size: 10px;
  font-weight: bold;
  text-anchor: end;
}
</style>
