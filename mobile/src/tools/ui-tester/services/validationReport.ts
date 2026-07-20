import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { ValidationReport, ValidationRun } from "../types/validation";
import { redactValidationRun } from "./validationRedaction";

export function createValidationReport(
  runs: ValidationRun[]
): ValidationReport {
  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    runs: runs.map(redactValidationRun),
  };
}

export function formatValidationReportFileName(exportedAt: string): string {
  const timestamp = new Date(exportedAt)
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")
    .replace(".", "-");
  return `aio-validation-${timestamp}.json`;
}

export async function exportValidationReport(
  runs: ValidationRun[]
): Promise<boolean> {
  const report = createValidationReport(runs);
  const path = await save({
    defaultPath: formatValidationReportFileName(report.exportedAt),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;

  await writeTextFile(path, JSON.stringify(report, null, 2));
  return true;
}
