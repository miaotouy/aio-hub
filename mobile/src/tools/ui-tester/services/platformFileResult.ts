import type { ValidationCommandResult } from "../types/validation";
import type {
  FullFileReadSummary,
  SelectedFileSummary,
} from "./platformFileValidation";

export function createPickerValidationResult(
  selected: SelectedFileSummary,
  multiple: boolean
): ValidationCommandResult {
  const minimumSelectionCount = multiple ? 2 : 1;
  const selectionPassed = selected.selectionCount >= minimumSelectionCount;
  const probePassed = selected.probeStatus === "passed";
  const selectionLabel = multiple
    ? `确认多选结果（${selected.selectionCount} 项）`
    : `接收选择结果（${selected.selectionCount} 项）`;
  const selectionSummary = selectionPassed
    ? `系统选择器返回 ${selected.selectionCount} 项；首项为 ${selected.scheme} / ${selected.fileName} / ${selected.referenceHash}。`
    : `系统选择器仅返回 ${selected.selectionCount} 项，未满足多选测试至少 2 项的要求。`;

  return {
    status: selectionPassed && probePassed ? "passed" : "failed",
    steps: [
      {
        id: "picker-result",
        label: selectionLabel,
        status: selectionPassed ? "passed" : "failed",
        durationMs: 0,
        summary: selectionSummary,
        details: {
          requestedMultiple: multiple,
          minimumSelectionCount,
          selectionCount: selected.selectionCount,
          scheme: selected.scheme,
          fileName: selected.fileName,
          referenceHash: selected.referenceHash,
          mime: selected.mime,
        },
      },
      {
        id: "picker-read-probe",
        label: multiple ? "读取多选结果首项" : "读取选择结果",
        status: probePassed ? "passed" : "failed",
        durationMs: selected.readProbeMs,
        summary: probePassed
          ? `已读取${multiple ? "首项的" : ""}首个数据块（${selected.bytesRead} bytes）。`
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
      selectionMode: multiple ? "multiple" : "single",
      minimumSelectionCount,
      selectionCount: selected.selectionCount,
      scheme: selected.scheme,
      size: selected.size,
      firstByteMs: selected.firstByteMs,
      readProbeMs: selected.readProbeMs,
    },
  };
}

export function createFullFileReadValidationResult(
  summary: FullFileReadSummary,
): ValidationCommandResult {
  const sizeMiB = summary.size >= 0 ? (summary.size / (1024 * 1024)).toFixed(2) : "未知";
  const status = summary.status;
  const stepStatus = status === "passed" ? "passed" : status === "failed" ? "failed" : "skipped";
  const stepSummary = status === "passed"
    ? `完整读取 ${summary.bytesRead} bytes，平均 ${summary.throughputMiBps} MiB/s。`
    : status === "cancelled"
      ? `用户停止读取，已完成 ${summary.bytesRead} / ${summary.size} bytes。`
      : summary.error || "完整读取失败。";

  return {
    status,
    steps: [
      {
        id: "full-file-read",
        label: `完整顺序读取（${sizeMiB} MiB）`,
        status: stepStatus,
        durationMs: summary.totalReadMs,
        summary: stepSummary,
        details: {
          scheme: summary.scheme,
          fileName: summary.fileName,
          referenceHash: summary.referenceHash,
          size: summary.size,
          bytesRead: summary.bytesRead,
          firstByteMs: summary.firstByteMs,
          readChunkBytes: summary.readChunkBytes,
          throughputMiBps: summary.throughputMiBps,
          failurePhase: summary.failurePhase || "none",
        },
      },
    ],
    metrics: {
      scheme: summary.scheme,
      size: summary.size,
      bytesRead: summary.bytesRead,
      firstByteMs: summary.firstByteMs,
      totalReadMs: summary.totalReadMs,
      readChunkBytes: summary.readChunkBytes,
      throughputMiBps: summary.throughputMiBps,
      failurePhase: summary.failurePhase || "none",
    },
  };
}
