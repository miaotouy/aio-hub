<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div
    class="node-wrapper"
    @mouseenter="showMenubar"
    @mouseleave="scheduleHideMenubar"
    @focusin="showMenubar"
    @focusout="handleFocusOut"
  >
    <div
      :class="[
        'graph-node',
        { 'active-leaf': data.isActiveLeaf },
        { 'is-disabled': !data.isEnabled },
        { 'is-compression': data.isCompressionNode },
        { 'is-compression-expanded': data.isExpanded },
        { 'connection-target': isTarget },
        { 'connection-valid': isTarget && isTargetValid },
        { 'connection-invalid': isTarget && !isTargetValid },
      ]"
      :style="nodeStyle"
    >
      <!-- 顶部：树结构入边的目标连接点 -->
      <Handle type="target" :position="Position.Top" />

      <!-- 节点内容 -->
      <GraphNodeContent :data="data" @toggle-expand="emit('toggle-expand')" />

      <!-- 底部：树结构出边的源连接点 -->
      <Handle type="source" :position="Position.Bottom" />
    </div>

    <!-- 悬浮操作栏 -->
    <GraphNodeMenubar
      v-if="isMenubarMounted"
      :message-id="id"
      :is-enabled="data.isEnabled"
      :is-active-leaf="data.isActiveLeaf"
      :role="data.role"
      :model-id="data.modelId"
      :profile-id="data.profileId"
      @copy="handleCopy"
      @toggle-enabled="handleToggleEnabled"
      @delete="handleDelete"
      @view-detail="(event: MouseEvent) => handleViewDetail(event)"
      @regenerate="handleRegenerate"
      @create-branch="handleCreateBranch"
      @interaction-active-change="handleMenubarInteractionActiveChange"
      @screenshot="emit('screenshot')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import type { Asset } from "@/types/asset-management";
import GraphNodeContent from "./GraphNodeContent.vue";
import GraphNodeMenubar from "./GraphNodeMenubar.vue";

interface NodeData {
  name: string;
  avatar: string;
  contentPreview: string;
  isActiveLeaf: boolean;
  isEnabled: boolean;
  timestamp: string;
  role: "user" | "assistant" | "system" | "tool";
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
  // 思考内容相关
  hasThinking?: boolean;
  thinkingPreview?: string | null;
  // 压缩节点相关
  isCompressionNode?: boolean;
  isExpanded?: boolean;
  originalMessageCount?: number;
  originalTokenCount?: number;
  // 模型和配置 ID
  modelId?: string;
  profileId?: string;
}

interface Props {
  id: string;
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
  (e: "toggle-expand"): void;
  (e: "screenshot"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const isMenubarMounted = ref(false);
const isMenubarInteractionActive = ref(false);
let hideMenubarTimer: ReturnType<typeof setTimeout> | null = null;

const clearMenubarHideTimer = () => {
  if (hideMenubarTimer) {
    clearTimeout(hideMenubarTimer);
    hideMenubarTimer = null;
  }
};

const showMenubar = () => {
  clearMenubarHideTimer();
  isMenubarMounted.value = true;
};

const scheduleHideMenubar = () => {
  if (isMenubarInteractionActive.value) return;

  clearMenubarHideTimer();
  hideMenubarTimer = setTimeout(() => {
    if (isMenubarInteractionActive.value) return;

    isMenubarMounted.value = false;
    hideMenubarTimer = null;
  }, 160);
};

const handleMenubarInteractionActiveChange = (active: boolean) => {
  isMenubarInteractionActive.value = active;
  if (active) {
    showMenubar();
  } else {
    scheduleHideMenubar();
  }
};

const handleFocusOut = (event: FocusEvent) => {
  const currentTarget = event.currentTarget;
  const relatedTarget = event.relatedTarget;

  if (
    currentTarget instanceof HTMLElement &&
    relatedTarget instanceof Node &&
    currentTarget.contains(relatedTarget)
  ) {
    return;
  }

  scheduleHideMenubar();
};

onUnmounted(() => {
  clearMenubarHideTimer();
});

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

.graph-node {
  position: relative;
  padding: 16px;
  padding-bottom: 24px; /* 为下方的 menubar 留出空间 */
  border: var(--border-width) solid var(--border-color);
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
  opacity: 0.6;
  filter: grayscale(0.8);
}

.graph-node.is-disabled :deep(.node-preview) {
  color: var(--el-text-color-secondary);
}

.graph-node.connection-valid {
  /* 有效目标：绿色边框 + 多层光晕 + 背景高亮 */
  border-color: var(--el-color-success);
  box-shadow:
    0 0 0 1px var(--el-color-success),
    0 0 16px 4px color-mix(in srgb, var(--el-color-success) 40%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--el-color-success) 15%, transparent);
  background-color: color-mix(
    in srgb,
    var(--el-color-success) 8%,
    var(--card-bg)
  );
}

.graph-node.connection-invalid {
  /* 无效目标：红色边框 + 多层光晕 + 警告背景 */
  border-color: var(--el-color-danger);
  box-shadow:
    0 0 0 1px var(--el-color-danger),
    0 0 16px 4px color-mix(in srgb, var(--el-color-danger) 50%, transparent),
    inset 0 20px color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  background-color: color-mix(
    in srgb,
    var(--el-color-danger) 5%,
    var(--card-bg)
  );
}

/* 压缩节点样式 */
.graph-node.is-compression {
  border-style: dashed;
  background-color: var(--bg-color-soft);
}

.graph-node.is-compression:hover {
  border-color: var(--primary-color);
  background-color: var(--card-bg);
}

.graph-node.is-compression-expanded {
  border-style: solid;
  border-color: var(--primary-color-light);
}
</style>
