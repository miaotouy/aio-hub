<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Database,
  FileCheck2,
  Gauge,
  LayoutGrid,
} from "lucide-vue-next";
import ComponentValidationView from "./ComponentValidationView.vue";
import PlatformFileValidationView from "./PlatformFileValidationView.vue";
import SqliteValidationView from "./SqliteValidationView.vue";
import ValidationReportActions from "../components/ValidationReportActions.vue";
import { useValidationRuns } from "../composables/useValidationRuns";
import { runPlatformFileScenario } from "../services/platformFileValidation";
import { runSqliteScenario } from "../services/sqliteValidation";
import type { ValidationRunStatus } from "../types/validation";

type SectionId = "overview" | "components" | "platform-files" | "sqlite";

const router = useRouter();
const activeSection = ref<SectionId>("overview");
const {
  runs,
  resumeRun,
  environment,
  totals,
  initialize,
  runAutomated,
  setManualObservation,
  setResumeRun,
  clearRuns,
} = useValidationRuns();

const sections = [
  { id: "overview" as const, label: "总览", icon: Gauge },
  { id: "components" as const, label: "组件与布局", icon: LayoutGrid },
  { id: "platform-files" as const, label: "平台文件", icon: FileCheck2 },
  { id: "sqlite" as const, label: "SQLite", icon: Database },
];

const activeView = computed(
  () =>
    ({
      components: ComponentValidationView,
      "platform-files": PlatformFileValidationView,
      sqlite: SqliteValidationView,
    })[activeSection.value as Exclude<SectionId, "overview">]
);

const statusText: Record<ValidationRunStatus, string> = {
  idle: "未运行",
  running: "运行中",
  passed: "通过",
  failed: "失败",
  cancelled: "已取消",
  manualPending: "待人工确认",
};

onMounted(async () => {
  await initialize();
  if (resumeRun.value) {
    const pending = resumeRun.value;
    const resumed =
      pending.suiteId === "sqlite"
        ? await runAutomated(
            "sqlite",
            "transaction-recovery-check",
            { resumedCaseId: pending.caseId },
            () => runSqliteScenario("transaction-recovery-check")
          )
        : await runAutomated(
            "platform-files",
            "resume-check",
            { resumedCaseId: pending.caseId },
            () => runPlatformFileScenario("resume-check")
          );
    setManualObservation(
      pending.id,
      resumed.status === "passed" ? "passed" : "failed",
      `自动恢复检查：${resumed.status}`
    );
    await setResumeRun(undefined);
  }
});
</script>

<template>
  <div class="app-view workbench-view">
    <header class="workbench-header safe-area-top">
      <button
        class="icon-button"
        type="button"
        title="返回"
        aria-label="返回"
        @click="router.push('/')"
      >
        <ArrowLeft :size="22" />
      </button>
      <div>
        <h1>组件与平台测试</h1>
        <p>
          {{ environment.platform }} {{ environment.osVersion || "" }} · App
          {{ environment.appVersion }}
        </p>
      </div>
    </header>

    <nav class="section-tabs" aria-label="验证板块">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        :class="{ active: activeSection === section.id }"
        @click="activeSection = section.id"
      >
        <component :is="section.icon" :size="16" />
        <span>{{ section.label }}</span>
      </button>
    </nav>

    <main class="workbench-content safe-area-bottom">
      <section v-if="activeSection === 'overview'" class="overview-view">
        <div class="overview-band">
          <div>
            <span>平台</span><strong>{{ environment.platform }}</strong>
          </div>
          <div>
            <span>系统</span
            ><strong
              >{{ environment.osVersion || "不可用" }} ·
              {{ environment.architecture || "未知架构" }}</strong
            >
          </div>
          <div>
            <span>应用版本</span><strong>{{ environment.appVersion }}</strong>
          </div>
          <div>
            <span>Tauri</span
            ><strong>{{ environment.tauriVersion || "不可用" }}</strong>
          </div>
          <div>
            <span>视口</span
            ><strong
              >{{ environment.viewportWidth || "?" }} ×
              {{ environment.viewportHeight || "?" }} @
              {{ environment.devicePixelRatio || "?" }}</strong
            >
          </div>
        </div>

        <div class="overview-summary">
          <span class="passed">{{ totals.passed }} 通过</span>
          <span class="failed">{{ totals.failed }} 失败</span>
          <span class="pending">{{ totals.pending }} 待确认</span>
        </div>

        <section class="overview-section">
          <h2>最近验证结果</h2>
          <p v-if="!runs.length" class="empty-text">尚未运行验证场景。</p>
          <div v-for="run in runs.slice(0, 8)" :key="run.id" class="recent-row">
            <div>
              <strong>{{ run.caseId }}</strong>
              <span
                >{{ run.suiteId }} ·
                {{ new Date(run.startedAt).toLocaleString() }}</span
              >
            </div>
            <span class="status" :data-status="run.status">{{
              statusText[run.status]
            }}</span>
          </div>
        </section>

        <section v-if="resumeRun" class="resume-section">
          <h2>未完成的跨重启验证</h2>
          <p>{{ resumeRun.caseId }} 正在等待恢复检查。</p>
        </section>

        <ValidationReportActions :runs="runs" @clear="clearRuns" />
      </section>

      <component :is="activeView" v-else />
    </main>
  </div>
</template>

<style scoped>
.workbench-view {
  min-height: 100dvh;
  background: var(--body-bg, var(--sidebar-bg));
  color: var(--text-primary);
}
.workbench-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 10px 16px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}
.workbench-header h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}
.workbench-header p {
  margin: 3px 0 0;
  color: var(--text-secondary, #6b7280);
  font-size: 11px;
}
.icon-button {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 50%;
}
.icon-button:active {
  background: var(--input-bg);
}
.section-tabs {
  display: flex;
  max-width: 100%;
  overflow-x: auto;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  scrollbar-width: none;
}
.section-tabs::-webkit-scrollbar {
  display: none;
}
.section-tabs button {
  display: inline-flex;
  min-width: max-content;
  height: 48px;
  flex: 1 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  color: var(--text-secondary, #6b7280);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  font-size: 13px;
}
.section-tabs button.active {
  color: var(--color-primary, #2563eb);
  border-bottom-color: currentColor;
}
.workbench-content {
  padding: 0 16px 28px;
}
.overview-view {
  padding-top: 16px;
}
.overview-band {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--divider-color, rgba(127, 127, 127, 0.18));
  border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  border-radius: 6px;
  overflow: hidden;
}
.overview-band div {
  min-width: 0;
  padding: 12px 10px;
  background: var(--card-bg);
}
.overview-band span,
.overview-band strong {
  display: block;
  overflow-wrap: anywhere;
}
.overview-band span {
  color: var(--text-secondary, #6b7280);
  font-size: 11px;
}
.overview-band strong {
  margin-top: 5px;
  font-size: 13px;
}
.overview-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  font-size: 13px;
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
.overview-section,
.resume-section {
  margin: 22px 0;
}
.overview-section h2,
.resume-section h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.recent-row {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 60px;
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}
.recent-row > div {
  min-width: 0;
  flex: 1;
}
.recent-row strong,
.recent-row span {
  display: block;
  overflow-wrap: anywhere;
}
.recent-row strong {
  font-size: 13px;
}
.recent-row div span,
.empty-text,
.resume-section p {
  margin-top: 4px;
  color: var(--text-secondary, #6b7280);
  font-size: 11px;
}
.recent-row .status {
  flex: 0 0 auto;
  font-size: 12px;
}
.status[data-status="passed"] {
  color: var(--color-success, #25804b);
}
.status[data-status="failed"] {
  color: var(--color-danger, #c23b3b);
}
.status[data-status="manualPending"] {
  color: var(--color-warning, #9a6500);
}
.resume-section {
  padding: 12px;
  background: var(--input-bg);
  border-left: 3px solid var(--color-warning, #9a6500);
}
@media (max-width: 380px) {
  .overview-band {
    grid-template-columns: 1fr;
  }
}
</style>
