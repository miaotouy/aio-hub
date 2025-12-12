<template>
  <div class="primary-pipeline-config">
    <el-alert title="关于主上下文管道" type="info" :closable="false" show-icon class="mb-4">
      <p>
        主上下文管道 (Primary Context Pipeline)
        是一系列按顺序执行的处理器，用于在向大语言模型（LLM）发送请求之前，构建和准备核心上下文内容。
      </p>
      <p>你可以通过拖拽来调整处理器的执行顺序，或通过开关来启用/禁用它们。顺序和状态将自动保存。</p>
    </el-alert>

    <div class="card-header">
      <span>处理器列表</span>
      <el-button type="primary" text @click="handleReset" :icon="Refresh" plain>
        重置为默认
      </el-button>
    </div>

    <div v-if="!draggableProcessors.length" class="empty-state">
      <el-empty description="没有可用的处理器" />
    </div>

    <VueDraggableNext
      v-else
      v-model="draggableProcessors"
      item-key="id"
      handle=".drag-handle"
      ghost-class="drag-ghost"
      drag-class="drag-active"
      chosen-class="drag-chosen"
      :force-fallback="true"
      :fallback-tolerance="3"
      :fallback-on-body="true"
      :animation="200"
      @start="onDragStart"
      @end="onDragEnd"
      class="processor-list"
    >
      <div v-for="processor in draggableProcessors" :key="processor.id" class="processor-item">
        <div class="drag-handle">
          <el-icon><Rank /></el-icon>
        </div>
        <div class="processor-info">
          <div class="processor-name">{{ processor.name }}</div>
          <div class="processor-description">
            {{ processor.description }}
          </div>
        </div>
        <div class="processor-actions">
          <el-switch
            :model-value="isEnabled(processor.id)"
            @update:model-value="(enabled) => toggleProcessor(processor.id, !!enabled)"
            :disabled="processor.isCore"
          />
        </div>
      </div>
    </VueDraggableNext>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { VueDraggableNext } from "vue-draggable-next";
import { usePrimaryContextPipelineStore } from "@/tools/llm-chat/stores/primaryContextPipelineStore";
import { ElSwitch, ElAlert, ElIcon, ElEmpty, ElButton, ElMessageBox } from "element-plus";
import { Rank, Refresh } from "@element-plus/icons-vue";
import type { ContextProcessor } from "@/tools/llm-chat/core/pipeline/types";
import { customMessage } from "@/utils/customMessage";

const pipelineStore = usePrimaryContextPipelineStore();

// 创建一个可用于拖拽的本地 ref
const draggableProcessors = ref<ContextProcessor[]>([...pipelineStore.processors]);

// 用于记录拖拽前的顺序，防止误触
const orderBeforeDrag = ref<string[]>([]);

// 监听 store 中处理器的变化，以同步外部注册/卸载的处理器
watch(
  () => pipelineStore.processors,
  (newProcessors) => {
    draggableProcessors.value = [...newProcessors];
  },
  { deep: true }
);

const isEnabled = (processorId: string) => {
  return pipelineStore.enabledProcessorIds.includes(processorId);
};

const toggleProcessor = (processorId: string, enabled: boolean) => {
  pipelineStore.setProcessorEnabled(processorId, enabled);
};

// 拖拽开始时记录当前顺序
const onDragStart = () => {
  orderBeforeDrag.value = draggableProcessors.value.map((p) => p.id);
};

const onDragEnd = () => {
  const newOrder = draggableProcessors.value.map((p) => p.id);

  // 检查顺序是否真的发生了变化
  const hasChanged = !orderBeforeDrag.value.every((id, index) => id === newOrder[index]);

  if (!hasChanged) {
    // 顺序没有变化，可能只是点击，不执行保存
    return;
  }

  pipelineStore.reorderProcessors(newOrder);
};

const handleReset = () => {
  ElMessageBox.confirm(
    "确定要将所有处理器恢复到默认顺序和启用状态吗？此操作不可撤销。",
    "确认重置",
    {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    }
  )
    .then(() => {
      pipelineStore.resetToDefaults();
      customMessage.success("已重置为默认设置");
    })
    .catch(() => {
      // 用户取消
    });
};
</script>

<style scoped>
.primary-pipeline-config {
  padding: 10px;
}

.mb-4 {
  margin-bottom: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  padding-bottom: 8px;
}

.processor-list {
  display: flex;
  flex-direction: column;
  /* 移除 gap，改用 margin-bottom 以避免拖拽计算偏移 */
}

.processor-item {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 12px; /* 使用 margin 代替 gap */
  border: 1px solid var(--el-border-color-light); /* 回归 1px 边框，避免尺寸跳动 */
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  user-select: none;
}

/* 最后一个元素不需要 margin-bottom */
.processor-item:last-child {
  margin-bottom: 0;
}

.processor-item:hover {
  border-color: var(--el-color-primary-light-5);
}

/* 拖拽手柄样式 */
.drag-handle {
  cursor: grab;
  margin-right: 12px;
  padding: 4px;
  color: var(--el-text-color-placeholder);
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: color 0.2s ease;
}

.drag-handle:hover {
  color: var(--el-color-primary);
}

.drag-handle:active {
  cursor: grabbing;
}

.processor-info {
  flex-grow: 1;
  min-width: 0;
}

.processor-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.processor-description {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.processor-actions {
  margin-left: 16px;
  flex-shrink: 0;
}

/* 拖拽占位符样式 - 主题色描边 */
.drag-ghost {
  opacity: 1;
  border: 1px dashed var(--el-color-primary);
}

/* 隐藏占位符内部的所有内容，只保留边框和背景 */
.drag-ghost > * {
  opacity: 0;
  visibility: hidden;
}

/* 被选中拖拽项样式 */
.drag-chosen {
  border-color: var(--el-color-primary);
}

/* 正在拖拽的项样式 */
.drag-active {
  opacity: 0.95;
  border: 1px solid var(--el-color-primary);
  background-color: var(--card-bg);
  box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
  z-index: 9999;
  cursor: grabbing;
  /* 关键：禁用过渡，防止拖拽时的延迟和偏移感 */
  transition: none;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 150px;
}
</style>
