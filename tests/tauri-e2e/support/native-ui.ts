import { execFileSync } from "node:child_process";
import path from "node:path";

interface NativeUiResult {
  success: boolean;
  command?: string;
  windowTitle?: string;
  processId?: number;
  treePath?: string;
  screenshotPath?: string;
  error?: string;
  details?: Record<string, string>;
}

function getHelperPath(): string {
  if (process.platform !== "win32") {
    throw new Error(
      "Windows native UI automation is only available on Windows."
    );
  }
  const helperPath = process.env.AIO_E2E_NATIVE_UI_HELPER?.trim();
  if (!helperPath) {
    throw new Error(
      "AIO_E2E_NATIVE_UI_HELPER is missing. Run the suite through bun run test:tauri:e2e:native."
    );
  }
  return path.resolve(helperPath);
}

function runNativeUi(
  command: "probe" | "select-files" | "select-folder" | "dump-tree",
  paths: string[],
  processId?: number
): NativeUiResult {
  const artifactDir = path.resolve(
    process.env.AIO_E2E_ARTIFACT_DIR?.trim() || ".dev-data/tauri-e2e"
  );
  const args = [command];
  for (const item of paths) args.push("--path", path.resolve(item));
  args.push(
    "--artifact-dir",
    artifactDir,
    "--timeout-ms",
    process.env.AIO_E2E_NATIVE_UI_TIMEOUT_MS?.trim() || "15000"
  );
  if (processId) {
    args.push("--process-id", String(processId));
  } else {
    args.push(
      "--process-name",
      process.env.AIO_E2E_PROCESS_NAME?.trim() || "aiohub"
    );
  }

  try {
    const output = execFileSync(getHelperPath(), args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    });
    return JSON.parse(output) as NativeUiResult;
  } catch (error) {
    const stdout =
      typeof error === "object" && error && "stdout" in error
        ? String(error.stdout)
        : "";
    if (stdout.trim()) {
      const result = JSON.parse(stdout) as NativeUiResult;
      throw new Error(result.error || `${command} failed`);
    }
    throw error;
  }
}

export function selectNativeFiles(
  paths: string[],
  processId: number
): NativeUiResult {
  return runNativeUi("select-files", paths, processId);
}

export function selectNativeFolder(
  folderPath: string,
  processId: number
): NativeUiResult {
  return runNativeUi("select-folder", [folderPath], processId);
}
