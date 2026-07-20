<script setup lang="ts">
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-vue-next";

defineProps<{
  passed: number;
  failed: number;
  pending: number;
  running?: boolean;
  phase?: string;
}>();
</script>

<template>
  <header class="run-header" aria-live="polite">
    <div class="run-count passed">
      <CheckCircle2 :size="17" />{{ passed }} 通过
    </div>
    <div class="run-count failed">
      <AlertCircle :size="17" />{{ failed }} 失败
    </div>
    <div class="run-count pending">
      <Clock3 :size="17" />{{ pending }} 待确认
    </div>
    <div v-if="running" class="run-phase">
      <var-loading size="small" />
      <span>{{ phase || "正在执行固定验证步骤" }}</span>
    </div>
  </header>
</template>

<style scoped>
.run-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-height: 44px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}

.run-count,
.run-phase {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  white-space: nowrap;
}

.passed {
  color: var(--color-success, #25804b);
}
.failed {
  color: var(--color-danger, #c23b3b);
}
.pending {
  color: var(--color-warning, #9a6500);
}

.run-phase {
  width: 100%;
  min-height: 24px;
  color: var(--text-secondary, #6b7280);
}
</style>
