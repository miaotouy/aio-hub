<template>
  <div class="execute-step" data-testid="migration-execute">
    <div v-if="forceRunning || !snapshot.report" class="running-panel">
      <div class="running-heading">
        <span class="loading-mark"><LoaderCircle :size="22" /></span>
        <div>
          <span>正在迁移旧版知识库</span>
          <h3>{{ phaseLabel }}</h3>
        </div>
        <strong>{{ progress.total > 0 ? `${percentage}%` : "…" }}</strong>
      </div>

      <el-progress
        v-if="progress.total > 0"
        :percentage="percentage"
        :show-text="false"
        :stroke-width="8"
        :status="progress.issues ? 'warning' : undefined"
      />
      <el-progress
        v-else
        :percentage="100"
        :show-text="false"
        :stroke-width="8"
        :indeterminate="true"
        :duration="2"
      />

      <div class="progress-meta">
        <div>
          <strong>{{ progress.completedCollections }}</strong
          ><span>已迁移集合</span>
        </div>
        <div>
          <strong>{{ progress.completedEntries }}</strong
          ><span>已迁移条目</span>
        </div>
        <div>
          <strong>{{ progress.pendingVectors }}</strong
          ><span>待重建向量</span>
        </div>
        <div>
          <strong>{{ progress.issues }}</strong
          ><span>发现问题</span>
        </div>
      </div>

      <p>迁移过程中请保持 AIO Hub 运行。旧目录不会被修改或删除。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LoaderCircle } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import {
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_PROGRESS_EVENT,
  type RecallMigrationProgress,
} from "../types";

const props = withDefaults(
  defineProps<{ context: UpgradeFlowContext; forceRunning?: boolean }>(),
  { forceRunning: false }
);
const forceRunning = computed(() => props.forceRunning);
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const progress = reactive<RecallMigrationProgress>({
  migrationId: snapshot.value.preview.migrationId,
  phase: "main",
  current: 0,
  total:
    snapshot.value.preview.sourceEntries + snapshot.value.preview.sourceVectors,
  completedCollections: 0,
  completedEntries: 0,
  pendingVectors: snapshot.value.preview.pendingVectors,
  issues: snapshot.value.preview.issueCount,
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
      main: "正在迁移集合与条目",
      vector: "正在迁移向量数据",
      "tag-pool": "正在迁移标签池",
      verify: "正在校验迁移结果",
      completed: "正在整理迁移报告",
    })[progress.phase]
);

onMounted(async () => {
  unlisten = await listen<RecallMigrationProgress>(
    KNOWLEDGE_MIGRATION_PROGRESS_EVENT,
    (event) => {
      if (event.payload.migrationId !== snapshot.value.preview.migrationId) {
        return;
      }
      Object.assign(progress, event.payload);
    }
  );
});

onUnmounted(() => {
  unlisten?.();
});
</script>

<style scoped>
.execute-step {
  display: grid;
  min-height: 100%;
  place-items: center;
}

.running-panel {
  display: grid;
  width: min(100%, 560px);
  gap: 20px;
  padding: 26px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--card-bg);
}

.running-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
}

.loading-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
}

.loading-mark svg {
  animation: migration-spin 1.1s linear infinite;
}

.running-heading span:not(.loading-mark) {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.running-heading h3 {
  margin: 3px 0 0;
  color: var(--text-color);
  font-size: 16px;
}

.running-heading > strong {
  color: var(--primary-color);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.progress-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.progress-meta div {
  display: grid;
  gap: 3px;
  padding: 10px 6px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  text-align: center;
}

.progress-meta strong {
  color: var(--text-color);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.progress-meta span,
.running-panel > p {
  color: var(--text-color-secondary);
  font-size: 10px;
}

.running-panel > p {
  margin: 0;
  text-align: center;
  line-height: 1.5;
}

@keyframes migration-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 520px) {
  .running-panel {
    padding: 18px;
  }

  .progress-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-mark svg {
    animation-duration: 2.4s;
  }
}
</style>
