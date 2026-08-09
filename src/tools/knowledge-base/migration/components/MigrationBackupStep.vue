<template>
  <label class="confirm-card" data-testid="migration-confirmation">
    <el-checkbox v-model="confirmed" />
    <span>
      <strong>我了解迁移风险，并确认已备份重要数据</strong>
      <small>
        旧目录仅作为只读来源，完成后不会修改或删除。
      </small>
    </span>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RecallMigrationFlowContext } from "../types";
import { getKnowledgeMigrationSnapshot } from "../types";

const props = defineProps<{
  context: RecallMigrationFlowContext;
  updateContext?: (updates: Record<string, unknown>) => void | Promise<void>;
}>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));

function updateSnapshot(updates: Partial<typeof snapshot.value>) {
  if (!props.updateContext) return;
  void props.updateContext({
    migration: {
      ...snapshot.value,
      ...updates,
    },
  });
}

const confirmed = computed({
  get: () => snapshot.value.backupConfirmed,
  set: (value: boolean) => {
    updateSnapshot({ backupConfirmed: value });
  },
});
</script>

<style scoped>
.confirm-card {
  box-sizing: border-box;
  display: flex;
  min-height: 64px;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 13px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.confirm-card:has(:checked) {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 48%,
    var(--border-color)
  );
  background: color-mix(in srgb, var(--primary-color) 6%, var(--card-bg));
}

.confirm-card > :deep(.el-checkbox) {
  min-width: 14px;
  flex: 0 0 14px;
  margin-top: 1px;
  margin-right: 0;
}

.confirm-card > span {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.confirm-card strong {
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.4;
}

.confirm-card small {
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .confirm-card {
    transition: none;
  }
}
</style>
