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

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ElSelect, ElOption, ElButton } from "element-plus";
import { Plus, Eye, FolderOpen, X } from "lucide-vue-next";
import { useCanvasStore } from "@/tools/web-canvas/stores/canvasStore";
import { formatDateTime } from "@/utils/time";
import { useToolsStore } from "@/stores/tools";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { DEFAULT_TOOL_CALL_CONFIG } from "@/tools/agent-manager/types/agent";
import { createModuleLogger } from "@/utils/logger";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useLlmChatUiState } from "../../composables/ui/useLlmChatUiState";

const logger = createModuleLogger("llm-chat/MiniCanvasControl");
const router = useRouter();
const agentStore = useAgentStore();
const toolsStore = useToolsStore();
const bus = useWindowSyncBus();

// 安全获取 canvasStore
const getCanvasStore = () => {
  try {
    return useCanvasStore();
  } catch (e) {
    logger.warn("Canvas store not initialized", e);
    return null;
  }
};

const canvasStore = getCanvasStore();
const { currentAgentId } = useLlmChatUiState();

const canvasList = computed(() => canvasStore?.canvasList || []);

const boundCanvasId = computed(() => {
  const agent = currentAgentId.value
    ? agentStore.getAgentById(currentAgentId.value)
    : null;
  return agent?.toolCallConfig?.toolSettings?.["web-canvas"]?.canvasId || null;
});

const pendingChangesCount = computed(() => {
  if (!canvasStore || !boundCanvasId.value) return 0;
  const canvas = canvasStore.canvasList.find(
    (c) => c.metadata.id === boundCanvasId.value
  );
  return canvas?.dirtyFileCount || 0;
});

/**
 * 绑定画布到当前 Agent
 */
function bindCanvas(canvasId: string | null) {
  const agent = currentAgentId.value
    ? agentStore.getAgentById(currentAgentId.value)
    : null;
  if (!agent) return;

  if (!agent.toolCallConfig) {
    agent.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
  if (agent.toolCallConfig && !agent.toolCallConfig.toolSettings) {
    agent.toolCallConfig.toolSettings = {};
  }

  if (agent.toolCallConfig && agent.toolCallConfig.toolSettings) {
    // 确保 web-canvas 配置对象存在
    if (!agent.toolCallConfig.toolSettings["web-canvas"]) {
      agent.toolCallConfig.toolSettings["web-canvas"] = {};
    }
    agent.toolCallConfig.toolSettings["web-canvas"].canvasId = canvasId;
  }

  agentStore.persistAgent(agent);
  logger.info("Agent 画布绑定已更新", { agentId: agent.id, canvasId });
}

/**
 * 新建画布并绑定
 */
async function handleCreateCanvas() {
  if (!canvasStore) return;
  const title = `canvas_${formatDateTime(new Date(), "yyyyMMdd_HHmmss")}`;
  const metadata = await canvasStore.createCanvas(title);
  if (metadata) {
    bindCanvas(metadata.id);
  }
}

/**
 * 预览当前画布
 */
function handlePreview() {
  if (!boundCanvasId.value) return;
  bus.requestAction("canvas:open-window", { canvasId: boundCanvasId.value });
}

/**
 * 跳转到画布管理
 */
function handleManage() {
  const toolPath = "/web-canvas";
  toolsStore.openTool(toolPath);
  router.push(toolPath);
}

// 监听自动创建事件
onMounted(() => {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { canvasId } = customEvent.detail;
    bindCanvas(canvasId);
  };
  window.addEventListener("canvas:auto-created", handler);

  onUnmounted(() => {
    window.removeEventListener("canvas:auto-created", handler);
  });

  // 确保列表已加载
  canvasStore?.loadCanvasList();
});
</script>

<template>
  <div class="mini-canvas-control">
    <div class="canvas-toolbar">
      <div class="canvas-selector-row">
        <span class="section-label">绑定画布</span>
        <el-select
          :model-value="boundCanvasId"
          @update:model-value="bindCanvas"
          placeholder="选择或创建画布"
          clearable
          size="small"
          class="canvas-select"
          aria-label="绑定画布"
        >
          <el-option
            v-for="item in canvasList"
            :key="item.metadata.id"
            :label="item.metadata.name"
            :value="item.metadata.id"
          />
          <template #empty>
            <div class="empty-hint">暂无可用画布</div>
          </template>
        </el-select>
        <el-button
          v-if="boundCanvasId"
          type="info"
          link
          @click="bindCanvas(null)"
          class="unbind-btn"
          aria-label="解除画布绑定"
          title="解除画布绑定"
        >
          <X :size="14" />
        </el-button>
      </div>
      <div class="control-footer">
        <el-button size="small" @click="handleCreateCanvas">
          <template #icon><Plus :size="14" /></template>
          新建
        </el-button>
        <el-button
          size="small"
          :disabled="!boundCanvasId"
          @click="handlePreview"
        >
          <template #icon><Eye :size="14" /></template>
          预览
        </el-button>
        <el-button size="small" @click="handleManage">
          <template #icon><FolderOpen :size="14" /></template>
          管理
        </el-button>
      </div>
    </div>
    <div v-if="!boundCanvasId || pendingChangesCount > 0" class="canvas-status">
      <div v-if="!boundCanvasId" class="hint-text">
        <div class="dot"></div>
        <span>首次工具调用写入时将自动创建</span>
      </div>

      <div v-if="pendingChangesCount > 0" class="pending-status">
        <div class="dot warning"></div>
        <span>{{ pendingChangesCount }} 个待定更改</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-canvas-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.canvas-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.canvas-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
}

.section-label {
  flex: none;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.canvas-selector-row {
  display: flex;
  flex: 1 1 260px;
  min-width: 0;
  gap: 8px;
  align-items: center;
}

.canvas-select {
  flex: 1;
  min-width: 0;
}

.unbind-btn {
  padding: 4px;
  height: 24px;
}

.hint-text,
.pending-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 0;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-text-color-placeholder);
}

.dot.warning {
  background-color: var(--el-color-warning);
}

.empty-hint {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.control-footer {
  display: flex;
  flex: none;
  gap: 8px;
}

.control-footer :deep(.el-button) {
  margin: 0;
  padding: 6px 8px;
}
</style>
