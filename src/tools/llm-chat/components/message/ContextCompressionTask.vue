<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronRight, Database, LoaderCircle, X } from "lucide-vue-next";
import type { ContextCompressionTaskView } from "../../types/contextCompression";

const props = defineProps<{
  task: ContextCompressionTaskView;
  readonly?: boolean;
}>();
const emit = defineEmits<{ cancel: [] }>();
const expanded = ref(false);
const statusLabel = computed(
  () =>
    ({ running: "正在压缩…", cancelled: "已取消", failed: "压缩失败" })[
      props.task.status
    ]
);
</script>

<template>
  <section class="compression-task" aria-label="上下文压缩">
    <div class="task-header">
      <button
        type="button"
        class="task-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronRight :size="14" :class="{ expanded }" />
        <Database :size="14" />
        <span>上下文压缩</span>
        <span class="task-count">{{ task.messageCount }} 条消息</span>
      </button>
      <span class="task-status" role="status">
        <LoaderCircle
          v-if="task.status === 'running'"
          :size="12"
          class="spinner"
        />
        {{ statusLabel }}
      </span>
      <button
        v-if="task.status === 'running' && !readonly"
        type="button"
        class="task-cancel"
        title="取消压缩"
        aria-label="取消压缩"
        @click="emit('cancel')"
      >
        <X :size="14" />
      </button>
    </div>
    <p v-if="expanded" class="task-detail">
      {{
        task.status === "running"
          ? "正在生成摘要，新消息将在摘要完成后继续请求。"
          : task.status === "cancelled"
            ? "压缩已取消，继续使用原始上下文。"
            : "压缩失败，继续使用原始上下文，可重新发起压缩。"
      }}
    </p>
  </section>
</template>

<style scoped>
.compression-task {
  margin: 12px 16px;
  padding: 10px 12px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  color: var(--text-color-secondary);
  font-size: 12px;
}
.task-header,
.task-toggle,
.task-status {
  display: flex;
  align-items: center;
  gap: 6px;
}
.task-header {
  flex-wrap: wrap;
}
.task-toggle,
.task-cancel {
  border: 0;
  padding: 2px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.task-toggle {
  color: var(--primary-color);
}
.task-toggle .expanded {
  transform: rotate(90deg);
}
.task-count {
  color: var(--text-color-secondary);
}
.task-cancel {
  margin-left: auto;
  display: flex;
  border-radius: 4px;
}
.task-cancel:hover {
  background: var(--hover-bg);
  color: var(--danger-color);
}
.task-detail {
  margin: 8px 0 0;
  line-height: 1.6;
}
.spinner {
  animation: compression-spin 1s linear infinite;
}
@keyframes compression-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
