import type { ValidationCommandResult } from "../types/validation";
import type { SelectedFileSummary } from "./platformFileValidation";

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
