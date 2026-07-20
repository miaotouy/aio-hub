import type { ValidationCommandResult } from "../types/validation";
import type {
  FullFileReadSummary,
  InterruptedFileReadSummary,
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
  mode: "compatibility" | "throughput" = "compatibility"
): ValidationCommandResult {
  const sizeMiB =
    summary.size >= 0 ? (summary.size / (1024 * 1024)).toFixed(2) : "未知";
  const status = summary.status;
  const stepId =
    mode === "throughput" ? "throughput-file-read" : "full-file-read";
  const label = mode === "throughput" ? "大块分块读取吞吐基线" : "完整顺序读取";
  const stepStatus =
    status === "passed" ? "passed" : status === "failed" ? "failed" : "skipped";
  const stepSummary =
    status === "passed"
      ? `完整读取 ${summary.bytesRead} bytes，平均 ${summary.throughputMiBps} MiB/s。`
      : status === "cancelled"
        ? `用户停止读取，已完成 ${summary.bytesRead} / ${summary.size} bytes。`
        : summary.error || "完整读取失败。";

  return {
    status,
    steps: [
      {
        id: stepId,
        label: `${label}（${sizeMiB} MiB）`,
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
      readMode: mode,
    },
  };
}

export function createInterruptedFileReadValidationResult(
  summary: InterruptedFileReadSummary
): ValidationCommandResult {
  const sizeMiB =
    summary.size >= 0 ? (summary.size / (1024 * 1024)).toFixed(2) : "未知";
  const status = summary.status;
  const stepStatus =
    status === "passed" ? "passed" : status === "failed" ? "failed" : "skipped";
  const interrupted = summary.interruptAtBytes > 0;
  const resumed =
    interrupted && summary.resumedOffset === summary.interruptAtBytes;
  const stepSummary =
    status === "passed"
      ? `在 ${summary.interruptAtBytes} bytes 中断，重新打开并从同一偏移续读到 EOF。`
      : status === "cancelled"
        ? `用户停止测试，已完成 ${summary.bytesRead} / ${summary.size} bytes。`
        : summary.error || "文件读取中断恢复失败。";

  return {
    status,
    steps: [
      {
        id: "interrupt-file-handle",
        label: "关闭中断点文件句柄",
        status: interrupted
          ? "passed"
          : status === "failed"
            ? "failed"
            : "skipped",
        durationMs: 0,
        summary: interrupted
          ? `读取到 ${summary.interruptAtBytes} bytes 后已关闭原文件句柄。`
          : "尚未到达计划中断点。",
        details: {
          interruptAtBytes: summary.interruptAtBytes,
        },
      },
      {
        id: "resume-file-handle",
        label: "重新打开并定位续读偏移",
        status: resumed
          ? "passed"
          : interrupted && status === "failed"
            ? "failed"
            : "skipped",
        durationMs: summary.resumeLatencyMs,
        summary: resumed
          ? `重新打开引用并定位到 ${summary.resumedOffset} bytes，耗时 ${summary.resumeLatencyMs} ms。`
          : "未完成重新打开和偏移定位。",
        details: {
          interruptAtBytes: summary.interruptAtBytes,
          resumedOffset: summary.resumedOffset,
          resumeLatencyMs: summary.resumeLatencyMs,
        },
      },
      {
        id: "interrupted-file-read-resume",
        label: `中断后重新打开续读（${sizeMiB} MiB）`,
        status: stepStatus,
        durationMs: summary.totalReadMs,
        summary: stepSummary,
        details: {
          scheme: summary.scheme,
          fileName: summary.fileName,
          referenceHash: summary.referenceHash,
          size: summary.size,
          bytesRead: summary.bytesRead,
          interruptAtBytes: summary.interruptAtBytes,
          resumedOffset: summary.resumedOffset,
          resumeLatencyMs: summary.resumeLatencyMs,
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
      interruptAtBytes: summary.interruptAtBytes,
      resumedOffset: summary.resumedOffset,
      resumeLatencyMs: summary.resumeLatencyMs,
      totalReadMs: summary.totalReadMs,
      readChunkBytes: summary.readChunkBytes,
      throughputMiBps: summary.throughputMiBps,
      failurePhase: summary.failurePhase || "none",
    },
  };
}
