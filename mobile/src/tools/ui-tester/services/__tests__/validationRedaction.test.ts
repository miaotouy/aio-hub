import { describe, expect, it } from "vitest";
import {
  redactValidationRun,
  redactValidationText,
} from "../validationRedaction";
import type { ValidationRun } from "../../types/validation";

describe("validation report redaction", () => {
  it("redacts local paths, picker URIs, and common secret forms", () => {
    const text =
      "C:\\Users\\name\\private.txt content://provider/document/42 sk-abcdefghijklmnop";
    expect(redactValidationText(text)).toBe(
      "[redacted-path] content://[redacted] [redacted-secret]"
    );
  });

  it("redacts nested run details without changing the source", () => {
    const run: ValidationRun = {
      id: "run-1",
      suiteId: "platform-files",
      caseId: "picker",
      status: "failed",
      startedAt: "2026-07-18T00:00:00.000Z",
      environment: { platform: "android", appVersion: "1" },
      inputSummary: {},
      steps: [],
      metrics: {},
      error: {
        code: "IO",
        phase: "read",
        message: "/storage/emulated/0/private.txt",
      },
    };

    const redacted = redactValidationRun(run);
    expect(redacted.error?.message).toBe("[redacted-path]");
    expect(run.error?.message).toContain("/storage/");
  });
});
