<template>
  <div class="primary-pipeline-config">
    <el-alert
      title="关于主上下文管道"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
    >
      <p>
        主上下文管道 (Primary Context Pipeline)
        是一系列按顺序执行的处理器，用于在向大语言模型（LLM）发送请求之前，构建和准备核心上下文内容。
      </p>
      <p>
        你可以通过拖拽来调整处理器的执行顺序，或通过开关来启用/禁用它们。顺序和状态将自动保存。
      </p>
    </el-alert>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>处理器列表</span>
        </div>
      </template>

      <div v-if="!draggableProcessors.length" class="empty-state">
        <el-empty description="没有可用的处理器" />
      </div>

      <draggable
        v-else
        v-model="draggableProcessors"
        item-key="id"
        handle=".drag-handle"
        ghost-class="ghost"
        @end="onDragEnd"
        class="processor-list"
      >
        <template #item="{ element: processor }">
          <div class="processor-item">
            <div class="drag-handle">
              <el-icon><Menu /></el-icon>
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
                @update:model-value="
                  (enabled) => toggleProcessor(processor.id, !!enabled)
                "
                :disabled="!processor.optional"
              />
            </div>
          </div>
        </template>
      </draggable>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import { usePrimaryContextPipelineStore } from "@/tools/llm-chat/stores/primaryContextPipelineStore";
import { ElCard, ElSwitch, ElAlert, ElIcon, ElEmpty } from "element-plus";
import { Menu } from "@element-plus/icons-vue";
import type { ContextProcessor } from "@/tools/llm-chat/core/pipeline/types";

const pipelineStore = usePrimaryContextPipelineStore();

// 创建一个可用于拖拽的本地 ref
const draggableProcessors = ref<ContextProcessor[]>([
  ...pipelineStore.processors,
]);

// 监听 store 中处理器的变化，以同步外部注册/卸载的处理器
watch(
  () => pipelineStore.processors,
  (newProcessors) => {
    draggableProcessors.value = [...newProcessors];
  },
  { deep: true },
);

const isEnabled = (processorId: string) => {
  return pipelineStore.enabledProcessorIds.includes(processorId);
};

const toggleProcessor = (processorId: string, enabled: boolean) => {
  pipelineStore.setProcessorEnabled(processorId, enabled);
};

const onDragEnd = () => {
  const orderedIds = draggableProcessors.value.map((p) => p.id);
  pipelineStore.reorderProcessors(orderedIds);
};
</script>

<style scoped>
.primary-pipeline-config {
  padding: 10px;
}

.mb-4 {
  margin-bottom: 16px;
}

.card-header {
  font-weight: bold;
}

.processor-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.processor-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-bg-color-page);
  transition: box-shadow 0.2s ease;
}

.processor-item:hover {
  box-shadow: var(--el-box-shadow-light);
}

.drag-handle {
  cursor: grab;
  margin-right: 12px;
  color: var(--el-text-color-placeholder);
  display: flex;
  align-items: center;
}

.drag-handle:active {
  cursor: grabbing;
}

.processor-info {
  flex-grow: 1;
}

.processor-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.processor-description {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.processor-actions {
  margin-left: 16px;
}

.ghost {
  opacity: 0.5;
  background: var(--el-color-primary-light-9);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 150px;
}
</style>
