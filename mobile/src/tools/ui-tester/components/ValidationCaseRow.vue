<script setup lang="ts">
import { Play, RotateCcw } from "lucide-vue-next";
import type { ValidationRunStatus } from "../types/validation";

defineProps<{
  title: string;
  description: string;
  status?: ValidationRunStatus;
  actionLabel?: string;
  disabled?: boolean;
}>();

defineEmits<{ run: [] }>();

const statusText: Record<ValidationRunStatus, string> = {
  idle: "未运行",
  running: "运行中",
  passed: "通过",
  failed: "失败",
  cancelled: "已取消",
  manualPending: "待人工确认",
};
</script>

<template>
  <div class="case-row">
    <div class="case-copy">
      <div class="case-title">{{ title }}</div>
      <div class="case-description">{{ description }}</div>
      <span v-if="status" class="case-status" :data-status="status">
        {{ statusText[status] }}
      </span>
    </div>
    <var-button
      class="run-button"
      type="primary"
      size="small"
      :loading="status === 'running'"
      :disabled="disabled || status === 'running'"
      @click="$emit('run')"
    >
      <RotateCcw v-if="status && status !== 'idle'" :size="16" />
      <Play v-else :size="16" />
      {{ actionLabel || "运行" }}
    </var-button>
  </div>
</template>

<style scoped>
.case-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 88px;
  padding: 14px 0;
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}

.case-copy { min-width: 0; }
.case-title { color: var(--text-primary); font-size: 15px; font-weight: 600; }
.case-description {
  margin-top: 4px;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.case-status {
  display: inline-block;
  margin-top: 7px;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
}

.case-status[data-status="passed"] { color: var(--color-success, #25804b); }
.case-status[data-status="failed"] { color: var(--color-danger, #c23b3b); }
.case-status[data-status="manualPending"] { color: var(--color-warning, #9a6500); }
.run-button { flex: 0 0 auto; }

@media (max-width: 380px) {
  .case-row { grid-template-columns: 1fr; }
  .run-button { justify-self: start; }
}
</style>
