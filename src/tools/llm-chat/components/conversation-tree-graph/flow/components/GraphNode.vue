<template>
  <div class="node-wrapper">
    <div
      :class="[
        'graph-node',
        { 'active-leaf': data.isActiveLeaf },
        { 'is-disabled': !data.isEnabled },
        { 'connection-target': isTarget },
        { 'connection-valid': isTarget && isTargetValid },
        { 'connection-invalid': isTarget && !isTargetValid },
      ]"
      :style="nodeStyle"
    >
      <!-- 顶部：树结构入边的目标连接点 -->
      <Handle type="target" :position="Position.Top" />

      <!-- 节点内容 -->
      <GraphNodeContent :data="data" />

      <!-- 底部：树结构出边的源连接点 -->
      <Handle type="source" :position="Position.Bottom" />
    </div>

    <!-- 悬浮操作栏 -->
    <GraphNodeMenubar
      :is-enabled="data.isEnabled"
      :is-active-leaf="data.isActiveLeaf"
      :zoom="viewport.zoom"
      :role="data.role"
      @copy="handleCopy"
      @toggle-enabled="handleToggleEnabled"
      @delete="handleDelete"
      @view-detail="(event: MouseEvent) => handleViewDetail(event)"
      @regenerate="handleRegenerate"
      @create-branch="handleCreateBranch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Handle, Position, useVueFlow } from "@vue-flow/core";
import type { Asset } from "@/types/asset-management";
import GraphNodeContent from "./GraphNodeContent.vue";
import GraphNodeMenubar from "./GraphNodeMenubar.vue";

// 获取当前画布的缩放级别
const { viewport } = useVueFlow();

interface NodeData {
  name: string;
  avatar: string;
  contentPreview: string;
  isActiveLeaf: boolean;
  isEnabled: boolean;
  timestamp: string;
  role: "user" | "assistant" | "system";
  status: "generating" | "complete" | "error";
  errorMessage?: string;
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
  attachments?: Asset[];
}

interface Props {
  data: NodeData;
  isConnecting: boolean;
  isTarget: boolean;
  isTargetValid: boolean;
}

interface Emits {
  (e: "copy"): void;
  (e: "toggle-enabled"): void;
  (e: "delete"): void;
  (e: "view-detail", event: MouseEvent): void;
  (e: "regenerate", options?: { modelId?: string; profileId?: string }): void;
  (e: "create-branch"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const nodeStyle = computed(() => {
  const style: { backgroundColor: string; borderColor?: string } = {
    backgroundColor: props.data.colors.background,
  };
  // 当节点不是当前活动分支时，才应用数据驱动的边框颜色
  // 活动分支的边框颜色由 CSS class (.active-leaf) 控制
  if (!props.data.isActiveLeaf) {
    style.borderColor = props.data.colors.border;
  }
  return style;
});

// 事件处理
const handleCopy = () => emit("copy");
const handleToggleEnabled = () => emit("toggle-enabled");
const handleDelete = () => emit("delete");
const handleViewDetail = (event: MouseEvent) => emit("view-detail", event);
const handleRegenerate = (options?: { modelId?: string; profileId?: string }) =>
  emit("regenerate", options);
const handleCreateBranch = () => emit("create-branch");
</script>

<style scoped>
.node-wrapper {
  position: relative;
}

/* 扩大悬停触发区域 */
.node-wrapper::after {
  content: "";
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
  border-width: 3px;
  border-color: var(--el-color-warning);
}

.graph-node.is-disabled {
  opacity: 0.5;
}

.graph-node.is-disabled :deep(.node-preview) {
  color: var(--text-color-light);
}

.graph-node.connection-valid {
  /* 有效目标：绿色边框 + 多层光晕 + 背景高亮 */
  border-color: var(--el-color-success);
  box-shadow:
    0 0 0 1px var(--el-color-success),
    0 0 16px 4px color-mix(in srgb, var(--el-color-success) 40%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--el-color-success) 15%, transparent);
  background-color: color-mix(in srgb, var(--el-color-success) 8%, var(--card-bg));
}

.graph-node.connection-invalid {
  /* 无效目标：红色边框 + 多层光晕 + 警告背景 */
  border-color: var(--el-color-danger);
  box-shadow:
    0 0 0 1px var(--el-color-danger),
    0 0 16px 4px color-mix(in srgb, var(--el-color-danger) 50%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  background-color: color-mix(in srgb, var(--el-color-danger) 5%, var(--card-bg));
}
</style>
