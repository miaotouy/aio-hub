import { describe, expect, it } from "vitest";
import type { SelectedFileSummary } from "../platformFileValidation";
import { createPickerValidationResult } from "../platformFileResult";

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
