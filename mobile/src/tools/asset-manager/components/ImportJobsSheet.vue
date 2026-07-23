<script setup lang="ts">
import { LoaderCircle, X } from "lucide-vue-next";
import { computed } from "vue";
import { formatAssetBytes } from "../composables/useAssetLibrary";
import type { AssetImportJob } from "../types";

const props = defineProps<{ jobs: AssetImportJob[] }>();
const emit = defineEmits<{ close: []; cancel: [jobId: string] }>();

const orderedJobs = computed(() =>
  [...props.jobs].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  )
);

function stateLabel(job: AssetImportJob) {
  const labels: Record<AssetImportJob["state"], string> = {
    pending: "等待中",
    running: "进行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  const failedCount = job.results.filter(
    (result) => result.status === "failed"
  ).length;
  if (job.state === "completed" && failedCount > 0) {
    return `完成，${failedCount} 项失败`;
  }
  return labels[job.state];
}

function visualState(job: AssetImportJob) {
  return job.state === "completed" &&
    job.results.some((result) => result.status === "failed")
    ? "failed"
    : job.state;
}

function itemErrorCodes(job: AssetImportJob) {
  return [
    ...new Set(job.results.map((result) => result.errorCode).filter(Boolean)),
  ].join(" · ");
}

function progress(job: AssetImportJob) {
  if (!job.totalBytes) return null;
  return Math.min(100, Math.round((job.bytesCopied / job.totalBytes) * 100));
}
</script>

<template>
  <div class="sheet-layer" role="presentation" @click.self="emit('close')">
    <section
      class="jobs-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-jobs-title"
      data-testid="asset-import-jobs-sheet"
    >
      <header class="sheet-header">
        <div>
          <h2 id="import-jobs-title">导入任务</h2>
          <p>任务状态由本地数据库恢复</p>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="关闭任务列表"
          @click="emit('close')"
        >
          <X :size="22" />
        </button>
      </header>
      <div v-if="!orderedJobs.length" class="empty-jobs">还没有导入任务</div>
      <div v-else class="jobs-list">
        <article
          v-for="job in orderedJobs"
          :key="job.id"
          class="job-row"
          data-testid="asset-import-job"
          :data-job-state="job.state"
          :data-error-code="job.errorCode || itemErrorCodes(job)"
        >
          <div class="job-header">
            <strong>{{
              job.sourceKind === "unknown" ? "文件" : job.sourceKind
            }}</strong>
            <span :data-state="visualState(job)">
              <LoaderCircle
                v-if="job.state === 'running'"
                class="spin"
                :size="14"
              />
              {{ stateLabel(job) }}
            </span>
          </div>
          <div class="job-meta">
            <span>{{ job.completedCount }}/{{ job.sourceCount }} 项</span>
            <span v-if="job.totalBytes"
              >{{ formatAssetBytes(job.bytesCopied) }} /
              {{ formatAssetBytes(job.totalBytes) }}</span
            >
            <span v-else>{{ new Date(job.updatedAt).toLocaleString() }}</span>
          </div>
          <div
            v-if="job.state === 'running' || job.state === 'pending'"
            class="job-progress"
          >
            <span :style="{ width: `${progress(job) ?? 14}%` }" />
          </div>
          <p v-if="job.errorCode" class="job-error">{{ job.errorCode }}</p>
          <p v-else-if="itemErrorCodes(job)" class="job-error">
            {{ itemErrorCodes(job) }}
          </p>
          <button
            v-if="job.state === 'running' || job.state === 'pending'"
            class="cancel-button"
            type="button"
            @click="emit('cancel', job.id)"
          >
            取消任务
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.42);
}

.jobs-sheet {
  width: 100%;
  max-height: min(76vh, 680px);
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  background: var(--overlay-bg);
  border-top: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-xl) var(--app-radius-xl) 0 0;
}

.sheet-header {
  min-height: 64px;
  padding: 14px 12px 10px 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.sheet-header h2 {
  margin: 0;
  font-size: 17px;
}
.sheet-header p {
  margin: 4px 0 0;
  color: var(--text-color-light);
  font-size: 12px;
}

.icon-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  color: var(--text-color);
  background: transparent;
  border: 0;
}

.jobs-list {
  min-height: 0;
  padding: 8px 18px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.empty-jobs {
  min-height: 180px;
  padding: 20px;
  display: grid;
  place-items: center;
  color: var(--text-color-light);
}

.job-row {
  padding: 14px 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.job-row:last-child {
  border-bottom: 0;
}

.job-header,
.job-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.job-header strong {
  font-size: 14px;
}
.job-header span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-color-light);
  font-size: 12px;
}
.job-header span[data-state="failed"] {
  color: var(--danger-color);
}
.job-header span[data-state="running"] {
  color: var(--primary-color);
}
.job-header span[data-state="completed"] {
  color: var(--success-color);
}
.job-meta {
  margin-top: 5px;
  color: var(--text-color-light);
  font-size: 12px;
}

.job-progress {
  height: 5px;
  margin-top: 9px;
  overflow: hidden;
  background: var(--border-color);
  border-radius: 99px;
}

.job-progress span {
  display: block;
  height: 100%;
  background: var(--primary-color);
  border-radius: inherit;
}
.job-error {
  margin: 8px 0 0;
  color: var(--danger-color);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.cancel-button {
  min-height: 36px;
  margin-top: 9px;
  padding: 0 11px;
  color: var(--danger-color);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--danger-color) 35%, transparent);
  border-radius: var(--app-radius-md);
  font-size: 12px;
}

.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
