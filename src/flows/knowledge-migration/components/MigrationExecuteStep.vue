<template>
  <div class="execute-step" data-testid="migration-execute">
    <div v-if="!snapshot.report" class="running-card">
      <el-icon class="is-loading"><Loading /></el-icon>
      <h3>正在迁移旧数据</h3>
      <p>{{ phaseLabel }}</p>
      <el-progress
        v-if="progress.total > 0"
        :percentage="percentage"
        :status="progress.issues ? 'warning' : undefined"
      />
      <el-progress
        v-else
        :percentage="100"
        :indeterminate="true"
        :duration="2"
      />
      <div class="progress-meta">
        <span>集合 {{ progress.completedCollections }}</span>
        <span>条目 {{ progress.completedEntries }}</span>
        <span>待重建向量 {{ progress.pendingVectors }}</span>
        <span>问题 {{ progress.issues }}</span>
      </div>
    </div>
    <el-result
      v-else
      data-testid="migration-execute-result"
      :icon="snapshot.report.mainStatus === 'completed' ? 'success' : 'warning'"
      :title="
        snapshot.report.mainStatus === 'completed'
          ? '主数据迁移完成'
          : '迁移部分完成'
      "
      sub-title="继续查看结构化校验报告。"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import {
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_PROGRESS_EVENT,
  type RecallMigrationProgress,
} from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const progress = reactive<RecallMigrationProgress>({
  migrationId: snapshot.value.preview.migrationId,
  phase: "main",
  current: 0,
  total:
    snapshot.value.preview.sourceEntries + snapshot.value.preview.sourceVectors,
  completedCollections: 0,
  completedEntries: 0,
  pendingVectors: 0,
  issues: 0,
});
let unlisten: UnlistenFn | undefined;
const percentage = computed(() =>
  progress.total > 0
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : 0
);
const phaseLabel = computed(
  () =>
    ({
      main: "正在迁移集合与条目…",
      vector: "正在迁移向量…",
      "tag-pool": "正在迁移标签池…",
      verify: "正在校验迁移结果…",
      completed: "迁移任务已完成",
    })[progress.phase]
);

onMounted(async () => {
  unlisten = await listen<RecallMigrationProgress>(
    KNOWLEDGE_MIGRATION_PROGRESS_EVENT,
    (event) => {
      const expectedTotal = progress.total;
      Object.assign(progress, event.payload);
      progress.total = Math.max(expectedTotal, event.payload.total);
    }
  );
});
onUnmounted(() => unlisten?.());
</script>

<style scoped>
.running-card {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 28px 18px;
  text-align: center;
}
.running-card > .el-icon {
  color: var(--el-color-primary);
  font-size: 42px;
}
h3 {
  margin: 0;
  color: var(--text-color);
}
p {
  margin: 0;
  color: var(--text-color-secondary);
}
.el-progress {
  width: min(100%, 520px);
}
.progress-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 16px;
  color: var(--text-color-secondary);
  font-size: 12px;
}
</style>
