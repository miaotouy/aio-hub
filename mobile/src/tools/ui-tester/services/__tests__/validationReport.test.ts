import { describe, expect, it } from "vitest";
import { formatValidationReportFileName } from "../validationReport";

describe("validation report filename", () => {
  it("keeps the export date and time precise while remaining Windows-safe", () => {
    expect(formatValidationReportFileName("2026-07-20T01:27:44.309Z")).toBe(
      "aio-validation-2026-07-20_01-27-44-309Z.json",
    );
  });
});
