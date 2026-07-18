import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { ValidationReport, ValidationRun } from "../types/validation";
import { redactValidationRun } from "./validationRedaction";

export function createValidationReport(runs: ValidationRun[]): ValidationReport {
  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    runs: runs.map(redactValidationRun),
  };
}

export async function exportValidationReport(runs: ValidationRun[]): Promise<boolean> {
  const path = await save({
    defaultPath: `aio-validation-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;

  await writeTextFile(path, JSON.stringify(createValidationReport(runs), null, 2));
  return true;
}
