<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, X } from "lucide-vue-next";
import { customDialog, customMessage } from "@/utils/feedback";
import ValidationCaseRow from "../components/ValidationCaseRow.vue";
import ValidationRunHeader from "../components/ValidationRunHeader.vue";
import ValidationStepList from "../components/ValidationStepList.vue";
import { useValidationRuns } from "../composables/useValidationRuns";
import {
  cleanupPlatformFileSandbox,
  runPlatformFileScenario,
  selectValidationFiles,
  terminateForResumeValidation,
} from "../services/platformFileValidation";
import type { ValidationCommandResult } from "../types/validation";

const {
  runs,
  runAutomated,
  createManualRun,
  setManualObservation,
  setResumeRun,
} = useValidationRuns();
const observation = ref("");

const suiteRuns = computed(() => runs.value.filter((run) => run.suiteId === "platform-files"));
const suiteTotals = computed(() => ({
  passed: suiteRuns.value.filter((run) => run.status === "passed").length,
  failed: suiteRuns.value.filter((run) => run.status === "failed").length,
  pending: suiteRuns.value.filter((run) => run.status === "manualPending").length,
}));
const latestRun = computed(() => suiteRuns.value[0]);
const running = computed(() => suiteRuns.value.some((run) => run.status === "running"));
const pendingRun = computed(() => suiteRuns.value.find((run) => run.status === "manualPending"));

function statusFor(caseId: string) {
  return suiteRuns.value.find((run) => run.caseId === caseId)?.status ?? "idle";
}

async function runPicker(caseId: string, multiple: boolean, kind: "file" | "photo") {
  await runAutomated(
    "platform-files",
    caseId,
    { multiple, kind },
    async (): Promise<ValidationCommandResult> => {
    const selected = await selectValidationFiles(multiple, kind);
    if (!selected) {
      return {
        status: "cancelled",
        steps: [{
          id: "picker-cancel",
          label: "取消系统选择器",
          status: "passed",
          durationMs: 0,
          summary: "选择器取消未产生错误，也未创建验证沙箱文件。",
        }],
        metrics: { selectionCount: 0 },
      };
    }
    const probePassed = selected.probeStatus === "passed";
    return {
      status: probePassed ? "passed" : "failed",
      steps: [
        {
          id: "picker-result",
          label: "接收脱敏选择结果",
          status: "passed",
          durationMs: 0,
          summary: `${selected.scheme} / ${selected.fileName} / ${selected.referenceHash}`,
          details: {
            selectionCount: selected.selectionCount,
            scheme: selected.scheme,
            fileName: selected.fileName,
            referenceHash: selected.referenceHash,
            mime: selected.mime,
          },
        },
        {
          id: "picker-read-probe",
          label: "读取选择结果",
          status: probePassed ? "passed" : "failed",
          durationMs: selected.readProbeMs,
          summary: probePassed
            ? `已读取首个数据块（${selected.bytesRead} bytes）。`
            : selected.probeError || "系统选择结果读取失败。",
          details: {
            size: selected.size,
            bytesRead: selected.bytesRead,
            firstByteMs: selected.firstByteMs,
            readProbeMs: selected.readProbeMs,
          },
        },
      ],
      metrics: {
        selectionCount: selected.selectionCount,
        scheme: selected.scheme,
        size: selected.size,
        firstByteMs: selected.firstByteMs,
        readProbeMs: selected.readProbeMs,
      },
    };
    },
  );
}

function beginManual(caseId: string, note: string): void {
  createManualRun("platform-files", caseId, { instruction: note });
  customMessage("场景已进入人工观察状态", "info");
}

async function runTermination(): Promise<void> {
  const confirmed = await customDialog({
    title: "执行系统终止恢复验证",
    message: "该操作会立即关闭当前应用进程。重新打开应用后，验证台会自动执行恢复检查。",
    confirmButtonText: "保存状态并关闭",
    cancelButtonText: "取消",
  });
  if (!confirmed) return;
  const run = createManualRun("platform-files", "system-termination", {
    expected: "restart-and-resume-check",
  });
  await setResumeRun(run);
  await terminateForResumeValidation();
}

function recordObservation(verdict: "passed" | "failed"): void {
  if (!pendingRun.value) return;
  setManualObservation(pendingRun.value.id, verdict, observation.value);
  observation.value = "";
}
</script>

<template>
  <section class="validation-page">
    <ValidationRunHeader
      :passed="suiteTotals.passed"
      :failed="suiteTotals.failed"
      :pending="suiteTotals.pending"
      :running="running"
      phase="正在处理系统选择结果或执行沙箱步骤"
    />

    <div class="section-heading">
      <h2>文件与照片入口</h2>
      <p>路径只显示 scheme、文件名和引用 hash，运行记录不会保存完整路径。</p>
    </div>
    <ValidationCaseRow title="单文件选择" description="调用系统文件选择器并记录脱敏返回类型。" :status="statusFor('single-file')" @run="runPicker('single-file', false, 'file')" />
    <ValidationCaseRow title="多文件选择" description="验证多选入口及用户取消行为。" :status="statusFor('multiple-files')" @run="runPicker('multiple-files', true, 'file')" />
    <ValidationCaseRow title="照片选择" description="调用带图片类型约束的系统入口。" :status="statusFor('photo')" @run="runPicker('photo', false, 'photo')" />

    <div class="section-heading"><h2>沙箱与恢复</h2></div>
    <ValidationCaseRow title="沙箱写入闭环" description="临时写入、原子改名、重开读取并清理，只操作固定验证目录。" :status="statusFor('sandbox-round-trip')" @run="runAutomated('platform-files', 'sandbox-round-trip', {}, () => runPlatformFileScenario('sandbox-round-trip'))" />
    <ValidationCaseRow title="写入失败清理" description="固定注入写入失败，检查半成品未残留。" :status="statusFor('write-failure-cleanup')" @run="runAutomated('platform-files', 'write-failure-cleanup', {}, () => runPlatformFileScenario('write-failure-cleanup'))" />
    <ValidationCaseRow title="后台恢复" description="开始后切到系统后台再返回，人工确认状态与临时文件表现。" :status="statusFor('background-resume')" action-label="开始观察" @run="beginManual('background-resume', 'background-and-return')" />
    <ValidationCaseRow title="云端文件与预览" description="选择云端占位文件，观察下载、离线、取消和 WebView 预览表现。" :status="statusFor('cloud-preview')" action-label="开始观察" @run="beginManual('cloud-preview', 'cloud-download-and-preview')" />
    <ValidationCaseRow title="系统终止后恢复" description="保存最小恢复标记后关闭应用，重启时自动检查。" :status="statusFor('system-termination')" action-label="执行" @run="runTermination" />
    <ValidationCaseRow title="清理验证沙箱" description="Rust 侧固定定位 ui-tester-validation，不接收目录参数。" :status="statusFor('cleanup')" action-label="清理" @run="runAutomated('platform-files', 'cleanup', {}, cleanupPlatformFileSandbox)" />

    <div v-if="pendingRun" class="manual-panel">
      <label for="manual-note">人工观察：{{ pendingRun.caseId }}</label>
      <var-input id="manual-note" v-model="observation" textarea :maxlength="500" placeholder="可选备注，不要填写完整路径或文件内容" />
      <div class="manual-actions">
        <var-button type="success" size="small" @click="recordObservation('passed')"><Check :size="16" />通过</var-button>
        <var-button type="danger" size="small" @click="recordObservation('failed')"><X :size="16" />失败</var-button>
      </div>
    </div>

    <ValidationStepList v-if="latestRun" :steps="latestRun.steps" />
    <p v-if="latestRun?.error" class="error-text">{{ latestRun.error.phase }}：{{ latestRun.error.message }}</p>
  </section>
</template>

<style scoped>
.validation-page { padding-bottom: 28px; }
.section-heading { margin-top: 22px; }
.section-heading h2 { margin: 0; color: var(--text-primary); font-size: 16px; }
.section-heading p { margin: 5px 0 0; color: var(--text-secondary, #6b7280); font-size: 12px; line-height: 1.5; }
.manual-panel { margin: 18px 0; padding: 14px 0; border-block: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18)); }
.manual-panel label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
.manual-actions { display: flex; gap: 8px; margin-top: 10px; }
.error-text { color: var(--color-danger, #c23b3b); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
</style>
