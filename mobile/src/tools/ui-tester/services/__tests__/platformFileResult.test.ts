import { describe, expect, it } from "vitest";
import type {
  FullFileReadSummary,
  InterruptedFileReadSummary,
  SelectedFileSummary,
} from "../platformFileValidation";
import {
  createFullFileReadValidationResult,
  createInterruptedFileReadValidationResult,
  createPickerValidationResult,
} from "../platformFileResult";

function createSelection(
  overrides: Partial<SelectedFileSummary> = {}
): SelectedFileSummary {
  return {
    selectionCount: 1,
    scheme: "content",
    fileName: "masked.bin",
    referenceHash: "0123456789abcdef",
    mime: "application/octet-stream",
    size: 1024,
    bytesRead: 1024,
    firstByteMs: 10,
    readProbeMs: 12,
    probeStatus: "passed",
    probeError: "",
    ...overrides,
  };
}

describe("createPickerValidationResult", () => {
  it("requires at least two returned items for a multiple-selection pass", () => {
    const result = createPickerValidationResult(createSelection(), true);

    expect(result.status).toBe("failed");
    expect(result.steps[0]).toMatchObject({
      label: "确认多选结果（1 项）",
      status: "failed",
    });
    expect(result.steps[0]?.summary).toContain("至少 2 项");
    expect(result.metrics).toMatchObject({
      selectionMode: "multiple",
      minimumSelectionCount: 2,
      selectionCount: 1,
    });
  });

  it("shows the selected count and passes a readable multiple selection", () => {
    const result = createPickerValidationResult(
      createSelection({ selectionCount: 3 }),
      true
    );

    expect(result.status).toBe("passed");
    expect(result.steps[0]).toMatchObject({
      label: "确认多选结果（3 项）",
      status: "passed",
    });
    expect(result.steps[1]?.label).toBe("读取多选结果首项");
  });

  it("keeps probe failure separate from a valid selection count", () => {
    const result = createPickerValidationResult(
      createSelection({
        selectionCount: 2,
        probeStatus: "failed",
        probeError: "read failed",
      }),
      true
    );

    expect(result.status).toBe("failed");
    expect(result.steps[0]?.status).toBe("passed");
    expect(result.steps[1]).toMatchObject({
      status: "failed",
      summary: "read failed",
    });
  });
});

describe("createFullFileReadValidationResult", () => {
  const completed: FullFileReadSummary = {
    scheme: "content",
    fileName: "large.bin",
    referenceHash: "0123456789abcdef",
    size: 8 * 1024 * 1024,
    bytesRead: 8 * 1024 * 1024,
    firstByteMs: 15,
    totalReadMs: 1000,
    throughputMiBps: 8,
    readChunkBytes: 64 * 1024,
    status: "passed",
    failurePhase: "",
    error: "",
  };

  it("records completed full-read metrics", () => {
    const result = createFullFileReadValidationResult(completed);

    expect(result.status).toBe("passed");
    expect(result.steps[0]).toMatchObject({
      label: "完整顺序读取（8.00 MiB）",
      status: "passed",
    });
    expect(result.metrics).toMatchObject({
      bytesRead: 8 * 1024 * 1024,
      throughputMiBps: 8,
    });
  });

  it("keeps a user-stopped read as cancelled", () => {
    const result = createFullFileReadValidationResult({
      ...completed,
      bytesRead: 2 * 1024 * 1024,
      status: "cancelled",
    });

    expect(result.status).toBe("cancelled");
    expect(result.steps[0]?.status).toBe("skipped");
    expect(result.steps[0]?.summary).toContain("用户停止读取");
  });

  it("labels the 1 MiB bounded read as the throughput baseline", () => {
    const result = createFullFileReadValidationResult(
      {
        ...completed,
        readChunkBytes: 1024 * 1024,
        throughputMiBps: 24,
      },
      "throughput"
    );

    expect(result.steps[0]).toMatchObject({
      id: "throughput-file-read",
      label: "大块分块读取吞吐基线（8.00 MiB）",
    });
    expect(result.metrics).toMatchObject({
      readMode: "throughput",
      readChunkBytes: 1024 * 1024,
      throughputMiBps: 24,
    });
  });
});

describe("createInterruptedFileReadValidationResult", () => {
  const resumed: InterruptedFileReadSummary = {
    scheme: "content",
    fileName: "large.bin",
    referenceHash: "0123456789abcdef",
    size: 8 * 1024 * 1024,
    bytesRead: 8 * 1024 * 1024,
    firstByteMs: 12,
    totalReadMs: 600,
    throughputMiBps: 13.33,
    readChunkBytes: 1024 * 1024,
    interruptAtBytes: 4 * 1024 * 1024,
    resumedOffset: 4 * 1024 * 1024,
    resumeLatencyMs: 18,
    status: "passed",
    failurePhase: "",
    error: "",
  };

  it("records the interruption point and resumed offset", () => {
    const result = createInterruptedFileReadValidationResult(resumed);

    expect(result.status).toBe("passed");
    expect(result.steps[0]).toMatchObject({
      id: "interrupt-file-handle",
      status: "passed",
    });
    expect(result.steps[1]).toMatchObject({
      id: "resume-file-handle",
      status: "passed",
    });
    expect(result.steps[2]?.id).toBe("interrupted-file-read-resume");
    expect(result.metrics).toMatchObject({
      interruptAtBytes: 4 * 1024 * 1024,
      resumedOffset: 4 * 1024 * 1024,
      resumeLatencyMs: 18,
    });
  });

  it("keeps a seek failure visible in the exported result", () => {
    const result = createInterruptedFileReadValidationResult({
      ...resumed,
      status: "failed",
      failurePhase: "seek",
      resumedOffset: 0,
      error: "provider does not support seek",
    });

    expect(result.status).toBe("failed");
    expect(result.steps[1]).toMatchObject({
      status: "failed",
    });
    expect(result.steps[2]?.summary).toBe("provider does not support seek");
    expect(result.metrics.failurePhase).toBe("seek");
  });
});
