<template>
  <div class="cleanup-step" data-testid="migration-cleanup">
    <el-alert
      :closable="false"
      type="warning"
      show-icon
      title="清理不会提高迁移完整性"
      description="默认保留旧目录，方便回查和人工恢复。清理仅用于确认迁移报告完全通过后的空间回收。"
    />
    <el-radio-group v-model="cleanupChoice" class="choice-group">
      <el-radio value="keep" border>保留旧目录（推荐）</el-radio>
      <el-radio value="cleanup" border>永久清理旧目录</el-radio>
    </el-radio-group>
    <div v-if="cleanupChoice === 'cleanup'" class="danger-zone">
      <p>
        将仅删除受管旧目录中的 bases、vectors 和 tag_pool。请输入
        <strong>DELETE</strong> 再继续。
      </p>
      <el-input v-model="cleanupConfirmation" placeholder="DELETE" />
    </div>
  </div>
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
const cleanupChoice = computed({
  get: () => snapshot.value.cleanupChoice,
  set: (value: "keep" | "cleanup") => {
    updateSnapshot({ cleanupChoice: value });
  },
});
const cleanupConfirmation = computed({
  get: () => snapshot.value.cleanupConfirmation,
  set: (value: string) => {
    updateSnapshot({ cleanupConfirmation: value });
  },
});
</script>

<style scoped>
.cleanup-step {
  display: grid;
  gap: 16px;
}
.choice-group {
  display: grid;
  gap: 10px;
}
.choice-group :deep(.el-radio) {
  width: 100%;
  margin: 0;
}
.danger-zone {
  padding: 16px;
  border: 1px solid
    color-mix(in srgb, var(--el-color-danger) 30%, var(--border-color));
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-danger) 7%, var(--card-bg));
}
.danger-zone p {
  margin: 0 0 12px;
  color: var(--text-color-secondary);
  line-height: 1.6;
}
.danger-zone strong {
  color: var(--el-color-danger);
}
</style>
