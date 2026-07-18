export type ValidationSuiteId = "components" | "platform-files" | "sqlite";

export type ValidationRunStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "manualPending";

export interface ValidationEnvironment {
  platform: string;
  osVersion?: string;
  appVersion: string;
  tauriVersion?: string;
}

export interface ValidationStepResult {
  id: string;
  label: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  summary: string;
  details?: Record<string, string | number | boolean>;
}

export interface ValidationCommandResult {
  status: Exclude<ValidationRunStatus, "idle" | "running" | "manualPending">;
  steps: ValidationStepResult[];
  metrics: Record<string, number | string>;
  resumeToken?: string;
}

export interface ValidationRun {
  id: string;
  suiteId: ValidationSuiteId;
  caseId: string;
  status: ValidationRunStatus;
  startedAt: string;
  finishedAt?: string;
  environment: ValidationEnvironment;
  inputSummary: Record<string, string | number | boolean>;
  steps: ValidationStepResult[];
  metrics: Record<string, number | string>;
  error?: { code: string; phase: string; message: string };
  manualObservation?: { verdict: "passed" | "failed"; note?: string };
  resumeToken?: string;
}

export interface ValidationRunsConfig {
  version: string;
  runs: ValidationRun[];
  resumeRun?: ValidationRun;
}

export interface ValidationReport {
  schemaVersion: "1.0";
  exportedAt: string;
  runs: ValidationRun[];
}

export interface ValidationCaseDefinition {
  id: string;
  title: string;
  description: string;
  manual?: boolean;
  destructive?: boolean;
}
