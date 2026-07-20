<script setup lang="ts">
import { CheckCircle2, CircleMinus, XCircle } from "lucide-vue-next";
import type { ValidationStepResult } from "../types/validation";

defineProps<{ steps: ValidationStepResult[] }>();
</script>

<template>
  <div v-if="steps.length" class="step-list">
    <details v-for="step in steps" :key="step.id" class="step-row">
      <summary>
        <CheckCircle2
          v-if="step.status === 'passed'"
          :size="17"
          class="passed"
        />
        <XCircle
          v-else-if="step.status === 'failed'"
          :size="17"
          class="failed"
        />
        <CircleMinus v-else :size="17" class="skipped" />
        <span class="step-label">{{ step.label }}</span>
        <span class="step-time">{{ step.durationMs }} ms</span>
      </summary>
      <p>{{ step.summary }}</p>
      <dl v-if="step.details">
        <template v-for="(value, key) in step.details" :key="key">
          <dt>{{ key }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
    </details>
  </div>
</template>

<style scoped>
.step-list {
  border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}
.step-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}
.step-row summary {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
  list-style: none;
  font-size: 13px;
}
.step-row summary::-webkit-details-marker {
  display: none;
}
.step-label {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
.step-time {
  color: var(--text-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.step-row p {
  margin: 9px 0 0 25px;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.5;
}
.step-row dl {
  display: grid;
  grid-template-columns: minmax(90px, auto) 1fr;
  gap: 5px 10px;
  margin: 8px 0 0 25px;
  font-size: 12px;
}
.step-row dt {
  color: var(--text-secondary, #6b7280);
}
.step-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.passed {
  color: var(--color-success, #25804b);
}
.failed {
  color: var(--color-danger, #c23b3b);
}
.skipped {
  color: var(--text-secondary, #6b7280);
}
</style>
