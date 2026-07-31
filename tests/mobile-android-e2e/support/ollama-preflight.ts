import fs from "node:fs";
import path from "node:path";
import type { AndroidSdkTools } from "./android-sdk";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

export interface AndroidOllamaCheck {
  checkedAt: string;
  host: { available: boolean; modelCount: number; error?: string | null };
  devices: Array<{
    serial: string;
    directGateway: { httpStatus: number | null; hasModels: boolean };
    reverseLoopback?: { httpStatus: number | null; hasModels: boolean } | null;
    profileBaseUrl?: string | null;
  }>;
}

function skillScriptPath(): string {
  return path.join(
    Bun.env.USERPROFILE ?? "",
    ".codex",
    "skills",
    "test-android-ollama",
    "scripts",
    "test-android-ollama.ps1"
  );
}

export async function runAndroidOllamaCheck(options: {
  serial: string;
  tools: AndroidSdkTools;
  port?: number;
  run?: CommandRunner;
}): Promise<AndroidOllamaCheck> {
  const script = skillScriptPath();
  if (!fs.existsSync(script)) {
    throw new Error(`test-android-ollama skill script not found: ${script}`);
  }
  const run = options.run ?? runCommand;
  const platformTools = path.dirname(options.tools.adb);
  const separator = process.platform === "win32" ? ";" : ":";
  const result = await run(
    [
      "powershell",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-DeviceSerial",
      options.serial,
      "-HostPort",
      String(options.port ?? 11434),
    ],
    {
      timeoutMs: 60_000,
      env: { PATH: `${platformTools}${separator}${Bun.env.PATH ?? ""}` },
    }
  );
  return JSON.parse(result.stdout) as AndroidOllamaCheck;
}

export function isSuccessfulOllamaPath(check: AndroidOllamaCheck): boolean {
  const device = check.devices[0];
  return Boolean(
    check.host.available &&
      device &&
      ((device.reverseLoopback?.httpStatus === 200 &&
        device.reverseLoopback.hasModels) ||
        (device.directGateway.httpStatus === 200 && device.directGateway.hasModels))
  );
}

export async function isOllamaModelInstalled(
  modelId: string,
  port = 11434
): Promise<boolean> {
  const response = await fetch(`http://127.0.0.1:${port}/api/tags`, {
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!response?.ok) return false;
  const payload = (await response.json().catch(() => null)) as {
    models?: Array<{ name?: unknown; model?: unknown }>;
  } | null;
  return Boolean(
    payload?.models?.some(
      (model) => model.name === modelId || model.model === modelId
    )
  );
}
