<template>
  <div class="backup-step">
    <el-alert
      :closable="false"
      type="warning"
      show-icon
      title="建议先备份"
      :description="`请备份旧目录 ${snapshot.preview.legacyDataPath}，并确保其他相关窗口没有修改其中的数据。`"
    />
    <label class="confirm-card" data-testid="migration-backup-confirmation">
      <el-checkbox v-model="backupConfirmed" />
      <span
        ><strong>我已完成或确认无需额外备份</strong
        ><small>旧目录在迁移完成后仍会保留，除非最后单独确认清理。</small></span
      >
    </label>
    <label
      class="confirm-card danger"
      data-testid="migration-risk-confirmation"
    >
      <el-checkbox v-model="riskConfirmed" />
      <span
        ><strong>我确认开始写入新的 Recall 数据库</strong
        ><small
          >迁移会保留成功项；失败或中断后可按同一来源指纹重试。</small
        ></span
      >
    </label>
    <p v-if="!backupConfirmed || !riskConfirmed" class="hint">
      勾选两项后才能开始迁移。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import {
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
} from "../types";

const props = defineProps<{
  context: UpgradeFlowContext;
  updateContext?: (updates: Record<string, unknown>) => void | Promise<void>;
}>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));

function updateSnapshot(updates: Partial<typeof snapshot.value>) {
  const contribution =
    props.context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID];
  if (!contribution || !props.updateContext) return;
  void props.updateContext({
    contributions: {
      ...props.context.contributions,
      [KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]: {
        ...contribution,
        snapshot: {
          ...snapshot.value,
          ...updates,
        },
      },
    },
  });
}
const backupConfirmed = computed({
  get: () => snapshot.value.backupConfirmed,
  set: (value) => {
    updateSnapshot({ backupConfirmed: value });
  },
});
const riskConfirmed = computed({
  get: () => snapshot.value.riskConfirmed,
  set: (value) => {
    updateSnapshot({ riskConfirmed: value });
  },
});
</script>

<style scoped>
.backup-step {
  display: grid;
  gap: 14px;
}
.confirm-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
}
.confirm-card.danger {
  border-color: color-mix(
    in srgb,
    var(--el-color-warning) 45%,
    var(--border-color)
  );
}
.confirm-card span {
  display: grid;
  gap: 5px;
}
.confirm-card strong {
  color: var(--text-color);
}
.confirm-card small,
.hint {
  color: var(--text-color-secondary);
  line-height: 1.5;
}
.hint {
  margin: 0;
  font-size: 13px;
}
</style>
