<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Square, X } from "lucide-vue-next";
import { customDialog, customMessage } from "@/utils/feedback";
import ValidationCaseRow from "../components/ValidationCaseRow.vue";
import ValidationRunHeader from "../components/ValidationRunHeader.vue";
import ValidationStepList from "../components/ValidationStepList.vue";
import { useValidationRuns } from "../composables/useValidationRuns";
import {
  cleanupPlatformFileSandbox,
  runPlatformFileScenario,
  selectAndReadValidationFileAtThroughputBaseline,
  selectAndReadValidationFileFully,
  selectAndResumeValidationFileRead,
  selectValidationFiles,
  terminateForResumeValidation,
} from "../services/platformFileValidation";
import {
  createFullFileReadValidationResult,
  createInterruptedFileReadValidationResult,
  createPickerValidationResult,
} from "../services/platformFileResult";
import type { FullFileReadProgress } from "../services/platformFileValidation";
import type { ValidationCommandResult } from "../types/validation";

const {
  runs,
  runAutomated,
  createManualRun,
  setManualObservation,
  setResumeRun,
} = useValidationRuns();
const observation = ref("");
const fileReadController = ref<AbortController>();
const fileReadProgress = ref({ bytesRead: 0, totalBytes: 0 });
const fileReadCheckpoint = ref("");

const suiteRuns = computed(() =>
  runs.value.filter((run) => run.suiteId === "platform-files")
);
const suiteTotals = computed(() => ({
  passed: suiteRuns.value.filter((run) => run.status === "passed").length,
  failed: suiteRuns.value.filter((run) => run.status === "failed").length,
  pending: suiteRuns.value.filter((run) => run.status === "manualPending")
    .length,
}));
const latestRun = computed(() => suiteRuns.value[0]);
const running = computed(() =>
  suiteRuns.value.some((run) => run.status === "running")
);
const pendingRun = computed(() =>
  suiteRuns.value.find((run) => run.status === "manualPending")
);

function statusFor(caseId: string) {
  return suiteRuns.value.find((run) => run.caseId === caseId)?.status ?? "idle";
}

async function runPicker(
  caseId: string,
  multiple: boolean,
  kind: "file" | "photo"
) {
  await runAutomated(
    "platform-files",
    caseId,
    { multiple, kind },
    async (): Promise<ValidationCommandResult> => {
      const selected = await selectValidationFiles(multiple, kind);
      if (!selected) {
        return {
          status: "cancelled",
          steps: [
            {
              id: "picker-cancel",
              label: "取消系统选择器",
              status: "passed",
              durationMs: 0,
              summary: "选择器取消未产生错误，也未创建验证沙箱文件。",
            },
          ],
          metrics: { selectionCount: 0 },
        };
      }
      return createPickerValidationResult(selected, multiple);
    }
  );
}

function formatMiB(bytes: number): string {
  return (Math.max(bytes, 0) / (1024 * 1024)).toFixed(1);
}

function formatTotalMiB(bytes: number): string {
  return bytes >= 0 ? formatMiB(bytes) : "未知";
}

function updateFileReadProgress(progress: FullFileReadProgress): void {
  fileReadProgress.value = progress;
  if (progress.phase === "interrupted") {
    fileReadCheckpoint.value = `已在 ${formatMiB(progress.bytesRead)} MiB 关闭原文件句柄`;
  } else if (progress.phase === "resumed") {
    fileReadCheckpoint.value = `已重新打开并从 ${formatMiB(progress.bytesRead)} MiB 续读`;
  } else if (progress.phase === "completed") {
    fileReadCheckpoint.value = `中断、重开、定位与续读均已完成`;
  }
}

async function runFullFileRead(
  mode: "compatibility" | "throughput"
): Promise<void> {
  const controller = new AbortController();
  fileReadController.value = controller;
  fileReadProgress.value = { bytesRead: 0, totalBytes: 0 };
  fileReadCheckpoint.value = "";
  const caseId =
    mode === "throughput" ? "throughput-file-read" : "full-file-read";
  const reader =
    mode === "throughput"
      ? selectAndReadValidationFileAtThroughputBaseline
      : selectAndReadValidationFileFully;
  try {
    await runAutomated(
      "platform-files",
      caseId,
      { mode, readStrategy: "bounded-chunks" },
      async (): Promise<ValidationCommandResult> => {
        const summary = await reader(updateFileReadProgress, controller.signal);
        if (!summary) {
          return {
            status: "cancelled",
            steps: [
              {
                id: "picker-cancel",
                label: "取消完整读取样本选择",
                status: "passed",
                durationMs: 0,
                summary: "用户取消系统选择器，未开始读取。",
              },
            ],
            metrics: { bytesRead: 0 },
          };
        }
        return createFullFileReadValidationResult(summary, mode);
      }
    );
  } finally {
    fileReadController.value = undefined;
  }
}

async function runInterruptedFileRead(): Promise<void> {
  const controller = new AbortController();
  fileReadController.value = controller;
  fileReadProgress.value = { bytesRead: 0, totalBytes: 0 };
  fileReadCheckpoint.value = "";
  try {
    await runAutomated(
      "platform-files",
      "interrupted-file-read-resume",
      { mode: "close-reopen-seek", interruptAfterMiB: 4 },
      async (): Promise<ValidationCommandResult> => {
        const summary = await selectAndResumeValidationFileRead(
          updateFileReadProgress,
          controller.signal
        );
        if (!summary) {
          return {
            status: "cancelled",
            steps: [
              {
                id: "picker-cancel",
                label: "取消中断恢复样本选择",
                status: "passed",
                durationMs: 0,
                summary: "用户取消系统选择器，未开始读取。",
              },
            ],
            metrics: { bytesRead: 0 },
          };
        }
        return createInterruptedFileReadValidationResult(summary);
      }
    );
  } finally {
    fileReadController.value = undefined;
  }
}

function beginManual(caseId: string, note: string): void {
  createManualRun("platform-files", caseId, { instruction: note });
  customMessage("场景已进入人工观察状态", "info");
}

async function runTermination(): Promise<void> {
  const confirmed = await customDialog({
    title: "执行系统终止恢复验证",
    message:
      "该操作会立即关闭当前应用进程。重新打开应用后，验证台会自动执行恢复检查。",
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
    <ValidationCaseRow
      title="单文件选择"
      description="调用系统文件选择器并记录脱敏返回类型。"
      :status="statusFor('single-file')"
      @run="runPicker('single-file', false, 'file')"
    />
    <ValidationCaseRow
      title="多文件选择"
      description="长按首个文件进入多选，至少选择 2 项；同时验证用户取消行为。"
      :status="statusFor('multiple-files')"
      @run="runPicker('multiple-files', true, 'file')"
    />
    <ValidationCaseRow
      title="照片选择"
      description="调用带图片类型约束的系统入口。"
      :status="statusFor('photo')"
      @run="runPicker('photo', false, 'photo')"
    />
    <ValidationCaseRow
      title="大文件兼容性读取"
      description="使用固定 64 KiB 缓冲区逐块跨 IPC 读取到 EOF，用于验证权限、取消和兼容性。"
      :status="statusFor('full-file-read')"
      action-label="选择并读取"
      :disabled="Boolean(fileReadController)"
      @run="runFullFileRead('compatibility')"
    />
    <ValidationCaseRow
      title="大文件吞吐基线"
      description="使用固定 1 MiB 有界分块读取到 EOF，记录接近正常使用的吞吐；不会一次性把整文件载入 WebView。"
      :status="statusFor('throughput-file-read')"
      action-label="测试速度"
      :disabled="Boolean(fileReadController)"
      @run="runFullFileRead('throughput')"
    />
    <ValidationCaseRow
      title="文件读取中断与恢复"
      description="读取到固定偏移后关闭句柄，重新打开同一引用并 seek 续读；请选择至少 2 MiB 的文件。"
      :status="statusFor('interrupted-file-read-resume')"
      action-label="测试续读"
      :disabled="Boolean(fileReadController)"
      @run="runInterruptedFileRead"
    />
    <div v-if="fileReadController || fileReadCheckpoint" class="read-progress">
      <span
        ><strong v-if="fileReadCheckpoint">{{ fileReadCheckpoint }} · </strong
        >已读取 {{ formatMiB(fileReadProgress.bytesRead) }} /
        {{ formatTotalMiB(fileReadProgress.totalBytes) }} MiB</span
      >
      <var-button
        v-if="fileReadController"
        type="warning"
        size="small"
        @click="fileReadController.abort()"
        ><Square :size="15" />停止</var-button
      >
    </div>

    <div class="section-heading"><h2>沙箱与恢复</h2></div>
    <ValidationCaseRow
      title="沙箱写入闭环"
      description="临时写入、原子改名、重开读取并清理，只操作固定验证目录。"
      :status="statusFor('sandbox-round-trip')"
      @run="
        runAutomated('platform-files', 'sandbox-round-trip', {}, () =>
          runPlatformFileScenario('sandbox-round-trip')
        )
      "
    />
    <ValidationCaseRow
      title="写入失败清理"
      description="固定注入写入失败，检查半成品未残留。"
      :status="statusFor('write-failure-cleanup')"
      @run="
        runAutomated('platform-files', 'write-failure-cleanup', {}, () =>
          runPlatformFileScenario('write-failure-cleanup')
        )
      "
    />
    <ValidationCaseRow
      title="空间不足清理（模拟）"
      description="写入 64 KiB 后固定注入 ENOSPC，验证 .part 半成品被清理；不会占满设备磁盘。"
      :status="statusFor('space-exhaustion-cleanup')"
      @run="
        runAutomated('platform-files', 'space-exhaustion-cleanup', {}, () =>
          runPlatformFileScenario('space-exhaustion-cleanup')
        )
      "
    />
    <ValidationCaseRow
      title="后台恢复"
      description="开始后切到系统后台再返回，人工确认状态与临时文件表现。"
      :status="statusFor('background-resume')"
      action-label="开始观察"
      @run="beginManual('background-resume', 'background-and-return')"
    />
    <ValidationCaseRow
      title="云端文件与预览"
      description="选择云端占位文件，观察下载、离线、取消和 WebView 预览表现。"
      :status="statusFor('cloud-preview')"
      action-label="开始观察"
      @run="beginManual('cloud-preview', 'cloud-download-and-preview')"
    />
    <ValidationCaseRow
      title="系统终止后恢复"
      description="保存最小恢复标记后关闭应用，重启时自动检查。"
      :status="statusFor('system-termination')"
      action-label="执行"
      @run="runTermination"
    />
    <ValidationCaseRow
      title="清理验证沙箱"
      description="Rust 侧固定定位 ui-tester-validation，不接收目录参数。"
      :status="statusFor('cleanup')"
      action-label="清理"
      @run="
        runAutomated(
          'platform-files',
          'cleanup',
          {},
          cleanupPlatformFileSandbox
        )
      "
    />

    <div v-if="pendingRun" class="manual-panel">
      <label for="manual-note">人工观察：{{ pendingRun.caseId }}</label>
      <var-input
        id="manual-note"
        v-model="observation"
        textarea
        :maxlength="500"
        placeholder="可选备注，不要填写完整路径或文件内容"
      />
      <div class="manual-actions">
        <var-button
          type="success"
          size="small"
          @click="recordObservation('passed')"
          ><Check :size="16" />通过</var-button
        >
        <var-button
          type="danger"
          size="small"
          @click="recordObservation('failed')"
          ><X :size="16" />失败</var-button
        >
      </div>
    </div>

    <ValidationStepList v-if="latestRun" :steps="latestRun.steps" />
    <p v-if="latestRun?.error" class="error-text">
      {{ latestRun.error.phase }}：{{ latestRun.error.message }}
    </p>
  </section>
</template>

<style scoped>
.validation-page {
  padding-bottom: 28px;
}
.section-heading {
  margin-top: 22px;
}
.section-heading h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
}
.section-heading p {
  margin: 5px 0 0;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.5;
}
.manual-panel {
  margin: 18px 0;
  padding: 14px 0;
  border-block: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
}
.manual-panel label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}
.manual-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.read-progress {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
}
.read-progress strong {
  color: var(--text-primary);
  font-weight: 600;
}
.error-text {
  color: var(--color-danger, #c23b3b);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
</style>
