import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ValidationCommandResult } from "../types/validation";

const errorHandler = createModuleErrorHandler("ui-tester/sqlite");

export type SqliteScenario =
  | "environment"
  | "connection"
  | "migration"
  | "codec"
  | "transaction-recovery"
  | "transaction-recovery-check"
  | "fts-query"
  | "benchmark";

export type SqlitePreset = "1k" | "10k" | "100k";

export async function runSqliteScenario(
  scenario: SqliteScenario,
  preset: SqlitePreset = "1k",
  faultPoint: "before-commit" | "after-write" = "before-commit",
): Promise<ValidationCommandResult> {
  try {
    return await invoke("run_sqlite_validation", {
      request: { scenario, preset, faultPoint },
    });
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "SQLite 验证命令执行失败",
      showToUser: false,
    });
    throw error;
  }
}

export function cancelSqliteValidation(): Promise<void> {
  return invoke("cancel_sqlite_validation");
}

export function prepareSqliteCrashValidation(
  faultPoint: "before-commit" | "after-write",
): Promise<void> {
  return invoke("prepare_sqlite_crash_validation", { faultPoint });
}

export function resetSqliteValidationDatabase(
  action: "rebuild" | "delete",
): Promise<ValidationCommandResult> {
  return invoke("reset_sqlite_validation_database", { action });
}
