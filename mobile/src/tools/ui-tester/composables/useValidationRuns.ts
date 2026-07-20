import { computed, readonly, ref, shallowReadonly } from "vue";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { arch, platform as osPlatform, version as osVersion } from "@tauri-apps/plugin-os";
import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { generateUuid } from "@/utils/uuid";
import type {
  ValidationCommandResult,
  ValidationEnvironment,
  ValidationRun,
  ValidationRunsConfig,
  ValidationSuiteId,
} from "../types/validation";
import { redactValidationRun, redactValidationText } from "../services/validationRedaction";

const logger = createModuleLogger("ui-tester/validation-runs");
const errorHandler = createModuleErrorHandler("ui-tester/validation-runs");
const runs = ref<ValidationRun[]>([]);
const resumeRun = ref<ValidationRun>();
const initialized = ref(false);
const environment = ref<ValidationEnvironment>({
  platform: "unknown",
  appVersion: "unknown",
});

const configManager = createConfigManager<ValidationRunsConfig>({
  moduleName: "ui-tester-validation",
  fileName: "validation-runs.json",
  version: "1.0.0",
  createDefault: () => ({ version: "1.0.0", runs: [] }),
});

function persist(): void {
  configManager.saveDebounced({
    version: "1.0.0",
    runs: runs.value.slice(0, 20).map(redactValidationRun),
    resumeRun: resumeRun.value ? redactValidationRun(resumeRun.value) : undefined,
  });
}

async function collectEnvironment(): Promise<ValidationEnvironment> {
  const fallbackPlatform = /android/i.test(navigator.userAgent)
    ? "android"
    : /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "ios"
      : "desktop";
  let platform = fallbackPlatform;
  let version: string | undefined;
  let architecture: string | undefined;
  try {
    platform = osPlatform();
    version = osVersion();
    architecture = arch();
  } catch {
    // Browser fallback keeps the validation page usable outside a native runtime.
  }
  const [appResult, tauriResult] = await Promise.allSettled([
    getVersion(),
    getTauriVersion(),
  ]);
  return {
    platform,
    osVersion: version,
    architecture,
    appVersion: appResult.status === "fulfilled" ? appResult.value : "unavailable",
    tauriVersion: tauriResult.status === "fulfilled" ? tauriResult.value : undefined,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

async function initialize(): Promise<void> {
  if (initialized.value) return;
  const [stored, currentEnvironment] = await Promise.all([
    configManager.load(),
    collectEnvironment(),
  ]);
  const recoveredAt = new Date().toISOString();
  runs.value = stored.runs.slice(0, 20).map((run) =>
    run.status === "running"
      ? {
          ...run,
          status: "failed",
          finishedAt: recoveredAt,
          error: {
            code: "RUN_INTERRUPTED",
            phase: "restore",
            message: "应用恢复时发现未完成的运行；上次选择器或平台调用被中断。",
          },
        }
      : run,
  );
  resumeRun.value = stored.resumeRun;
  environment.value = currentEnvironment;
  initialized.value = true;
  if (stored.runs.some((run) => run.status === "running")) persist();
}

function createRun(
  suiteId: ValidationSuiteId,
  caseId: string,
  inputSummary: Record<string, string | number | boolean> = {},
): ValidationRun {
  const run: ValidationRun = {
    id: generateUuid(),
    suiteId,
    caseId,
    status: "running",
    startedAt: new Date().toISOString(),
    environment: { ...environment.value },
    inputSummary,
    steps: [],
    metrics: {},
  };
  runs.value = [run, ...runs.value].slice(0, 20);
  persist();
  return run;
}

function replaceRun(id: string, run: ValidationRun): void {
  const index = runs.value.findIndex((item) => item.id === id);
  if (index >= 0) runs.value.splice(index, 1, run);
  persist();
}

async function runAutomated(
  suiteId: ValidationSuiteId,
  caseId: string,
  inputSummary: Record<string, string | number | boolean>,
  executor: () => Promise<ValidationCommandResult>,
): Promise<ValidationRun> {
  const run = createRun(suiteId, caseId, inputSummary);
  try {
    const result = await executor();
    const completed: ValidationRun = {
      ...run,
      status: result.status,
      finishedAt: new Date().toISOString(),
      steps: result.steps,
      metrics: result.metrics,
      resumeToken: result.resumeToken,
    };
    replaceRun(run.id, completed);
    logger.info("验证场景执行完成", {
      suiteId,
      caseId,
      status: completed.status,
    });
    return completed;
  } catch (error) {
    const message = redactValidationText(
      error instanceof Error ? error.message : String(error),
    );
    const failed: ValidationRun = {
      ...run,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: { code: "COMMAND_FAILED", phase: "invoke", message },
    };
    replaceRun(run.id, failed);
    errorHandler.handle(error as Error, {
      userMessage: "验证场景执行失败",
      context: { suiteId, caseId },
      showToUser: false,
    });
    return failed;
  }
}

function createManualRun(
  suiteId: ValidationSuiteId,
  caseId: string,
  inputSummary: Record<string, string | number | boolean>,
): ValidationRun {
  const run = createRun(suiteId, caseId, inputSummary);
  const pending = { ...run, status: "manualPending" as const };
  replaceRun(run.id, pending);
  return pending;
}

function setManualObservation(
  id: string,
  verdict: "passed" | "failed",
  note?: string,
): void {
  const run = runs.value.find((item) => item.id === id);
  if (!run) return;
  replaceRun(id, {
    ...run,
    status: verdict,
    finishedAt: new Date().toISOString(),
    manualObservation: {
      verdict,
      note: note?.trim() ? redactValidationText(note.trim()) : undefined,
    },
  });
}

async function setResumeRun(run?: ValidationRun): Promise<void> {
  resumeRun.value = run;
  await configManager.save({
    version: "1.0.0",
    runs: runs.value.slice(0, 20).map(redactValidationRun),
    resumeRun: run ? redactValidationRun(run) : undefined,
  });
}

async function clearRuns(): Promise<void> {
  runs.value = [];
  resumeRun.value = undefined;
  await configManager.save({ version: "1.0.0", runs: [] });
}

const totals = computed(() => ({
  passed: runs.value.filter((run) => run.status === "passed").length,
  failed: runs.value.filter((run) => run.status === "failed").length,
  pending: runs.value.filter((run) => run.status === "manualPending").length,
}));

export function useValidationRuns() {
  return {
    runs: shallowReadonly(runs),
    resumeRun: readonly(resumeRun),
    initialized: readonly(initialized),
    environment: readonly(environment),
    totals,
    initialize,
    runAutomated,
    createManualRun,
    setManualObservation,
    setResumeRun,
    clearRuns,
  };
}
