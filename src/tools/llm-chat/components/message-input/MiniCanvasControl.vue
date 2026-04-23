<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ElSelect, ElOption, ElButton, ElDivider } from "element-plus";
import { Brush, Plus, Eye, FolderOpen, X } from "lucide-vue-next";
import { useCanvasStore } from "@/tools/canvas/stores/canvasStore";
import { formatDateTime } from "@/utils/time";
import { useToolsStore } from "@/stores/tools";
import { useAgentStore } from "../../stores/agentStore";
import { DEFAULT_TOOL_CALL_CONFIG } from "../../types/agent";
import { createModuleLogger } from "@/utils/logger";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";

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

const canvasList = computed(() => canvasStore?.canvasList || []);
const currentAgentId = computed(() => agentStore.currentAgentId);

const boundCanvasId = computed(() => {
  const agent = currentAgentId.value ? agentStore.getAgentById(currentAgentId.value) : null;
  return agent?.toolCallConfig?.toolSettings?.canvas?.canvasId || null;
});

const pendingChangesCount = computed(() => {
  if (!canvasStore || !boundCanvasId.value) return 0;
  const canvas = canvasStore.canvasList.find((c) => c.metadata.id === boundCanvasId.value);
  return canvas?.dirtyFileCount || 0;
});

/**
 * 绑定画布到当前 Agent
 */
function bindCanvas(canvasId: string | null) {
  const agent = currentAgentId.value ? agentStore.getAgentById(currentAgentId.value) : null;
  if (!agent) return;

  if (!agent.toolCallConfig) {
    agent.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
  if (agent.toolCallConfig && !agent.toolCallConfig.toolSettings) {
    agent.toolCallConfig.toolSettings = {};
  }

  if (agent.toolCallConfig && agent.toolCallConfig.toolSettings) {
    // 确保 canvas 配置对象存在
    if (!agent.toolCallConfig.toolSettings.canvas) {
      agent.toolCallConfig.toolSettings.canvas = {};
    }
    agent.toolCallConfig.toolSettings.canvas.canvasId = canvasId;
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
  const toolPath = "/canvas";
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
    <div class="control-header">
      <Brush :size="16" />
      <span class="title">画布控制</span>
    </div>

    <div class="control-body">
      <div class="section-label">当前绑定画布</div>
      <div class="canvas-selector-row">
        <el-select
          :model-value="boundCanvasId"
          @update:model-value="bindCanvas"
          placeholder="选择或创建画布"
          clearable
          size="default"
          class="canvas-select"
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
        <el-button v-if="boundCanvasId" type="info" link @click="bindCanvas(null)" class="unbind-btn">
          <X :size="14" />
        </el-button>
      </div>

      <div v-if="!boundCanvasId" class="hint-text">
        <div class="dot"></div>
        <span>首次工具调用写入时将自动创建</span>
      </div>

      <div v-if="pendingChangesCount > 0" class="pending-status">
        <div class="dot warning"></div>
        <span>{{ pendingChangesCount }} 个待定更改</span>
      </div>
    </div>

    <el-divider />

    <div class="control-footer">
      <el-button size="small" @click="handleCreateCanvas">
        <template #icon><Plus :size="14" /></template>
        新建
      </el-button>
      <el-button size="small" :disabled="!boundCanvasId" @click="handlePreview">
        <template #icon><Eye :size="14" /></template>
        预览
      </el-button>
      <el-button size="small" @click="handleManage">
        <template #icon><FolderOpen :size="14" /></template>
        管理
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.mini-canvas-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--el-text-color-primary);
}

.control-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-color-primary);
}

.control-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.canvas-selector-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.canvas-select {
  flex: 1;
}

.unbind-btn {
  padding: 4px;
  height: 32px;
}

.hint-text,
.pending-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 2px 4px;
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
  justify-content: space-between;
  gap: 8px;
}

.control-footer :deep(.el-button) {
  flex: 1;
  margin: 0;
  padding: 8px 4px;
}

:deep(.el-divider--horizontal) {
  margin: 4px 0;
}
</style>
