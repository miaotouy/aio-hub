import fs from "node:fs";
import path from "node:path";
import type { Subprocess } from "bun";
import type { AndroidStudioAvd, ConnectedAndroidDevice } from "../types";
import type { AndroidSdkTools } from "./android-sdk";
import { AdbClient } from "./adb";
import type { CommandRunner } from "./process";
import {
  FatalWaitError,
  runCommand,
  terminateSubprocess,
  trackSubprocessExit,
  waitForSubprocessExit,
  waitUntil,
} from "./process";

export function parseAvdList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function listConfiguredAvds(
  tools: AndroidSdkTools,
  run: CommandRunner = runCommand
): Promise<string[]> {
  return parseAvdList((await run([tools.emulator, "-list-avds"])).stdout);
}

export async function inspectConnectedAvds(
  adb: AdbClient,
  configuredAvds: string[]
): Promise<{
  all: ConnectedAndroidDevice[];
  androidStudioAvds: AndroidStudioAvd[];
}> {
  const all = await adb.devices();
  const configured = new Set(configuredAvds);
  const inspected = await Promise.all(
    all.map((device) => adb.inspectAvd(device, configured))
  );
  return {
    all,
    androidStudioAvds: inspected.filter(
      (device): device is AndroidStudioAvd => device !== null
    ),
  };
}

export function selectRunningAvd(
  devices: AndroidStudioAvd[],
  requestedName: string,
  requestedSerial?: string
): AndroidStudioAvd | null {
  if (requestedSerial) {
    const device = devices.find(
      (candidate) => candidate.serial === requestedSerial
    );
    if (!device) {
      throw new Error(
        `Requested serial ${requestedSerial} is not a configured Android Studio AVD.`
      );
    }
    if (device.avdName !== requestedName) {
      throw new Error(
        `Requested serial ${requestedSerial} runs ${device.avdName}, not ${requestedName}.`
      );
    }
    return device;
  }
  const matches = devices.filter((device) => device.avdName === requestedName);
  if (matches.length > 1) {
    throw new Error(
      `Multiple running AVDs use ${requestedName}; set AIO_MOBILE_E2E_SERIAL.`
    );
  }
  return matches[0] ?? null;
}

export interface OwnedAvd {
  device: AndroidStudioAvd;
  startedByRunner: boolean;
  process?: Subprocess;
}

export async function ensureAvd(options: {
  tools: AndroidSdkTools;
  adb: AdbClient;
  avdName: string;
  serial?: string;
  logPath: string;
  bootTimeoutMs?: number;
  onProcessStarted?: (process: Subprocess) => void;
}): Promise<OwnedAvd> {
  const configuredAvds = await listConfiguredAvds(options.tools);
  if (!configuredAvds.includes(options.avdName)) {
    throw new Error(
      `AVD ${options.avdName} is not configured. Available: ${configuredAvds.join(", ")}`
    );
  }
  const before = await inspectConnectedAvds(options.adb, configuredAvds);
  const running = selectRunningAvd(
    before.androidStudioAvds,
    options.avdName,
    options.serial
  );
  if (running) return { device: running, startedByRunner: false };
  if (options.serial) {
    throw new Error(`Requested AVD serial is not connected: ${options.serial}`);
  }

  fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
  const logFile = Bun.file(options.logPath);
  const process = Bun.spawn(
    [
      options.tools.emulator,
      "-avd",
      options.avdName,
      "-no-boot-anim",
      "-no-audio",
    ],
    {
      stdin: "ignore",
      stdout: logFile,
      stderr: logFile,
      windowsHide: true,
      env: {
        ...Bun.env,
        ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL:
          Bun.env.ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL ?? "5",
      },
    }
  );
  options.onProcessStarted?.(process);
  const processExitCode = trackSubprocessExit(process);
  const previousSerials = new Set(before.all.map((device) => device.serial));
  try {
    const device = await waitUntil(
      async () => {
        const exitCode = processExitCode();
        if (exitCode !== null) {
          const tail = emulatorLogTail(options.logPath);
          throw new FatalWaitError(
            `AVD process exited with code ${exitCode}.${tail}`
          );
        }
        const current = await inspectConnectedAvds(options.adb, configuredAvds);
        const match = current.androidStudioAvds.find(
          (candidate) =>
            candidate.avdName === options.avdName &&
            !previousSerials.has(candidate.serial)
        );
        if (!match) return null;
        const booted = await options.adb.getProp(
          match.serial,
          "sys.boot_completed"
        );
        return booted === "1" ? match : null;
      },
      {
        timeoutMs: options.bootTimeoutMs ?? 180_000,
        intervalMs: 1_000,
        description: `AVD ${options.avdName} to boot`,
      }
    );
    process.unref();
    return { device, startedByRunner: true, process };
  } catch (error) {
    await terminateSubprocess(process, {
      gracefulTimeoutMs: 7_000,
      forceTimeoutMs: 3_000,
    });
    throw error;
  }
}

function emulatorLogTail(logPath: string): string {
  if (!fs.existsSync(logPath)) return "";
  const lines = fs
    .readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6);
  return lines.length > 0 ? ` Emulator log: ${lines.join(" | ")}` : "";
}

export async function stopOwnedAvd(adb: AdbClient, owned: OwnedAvd) {
  if (!owned.startedByRunner) return;
  await adb
    .serial(owned.device.serial, ["emu", "kill"], {
      allowFailure: true,
      timeoutMs: 5_000,
    })
    .catch(() => undefined);
  if (owned.process) {
    const exited = await waitForSubprocessExit(owned.process, 7_000);
    if (!exited) {
      await terminateSubprocess(owned.process, {
        gracefulTimeoutMs: 3_000,
        forceTimeoutMs: 2_000,
      });
    }
  }
  await waitUntil(
    async () => {
      const devices = await adb.devices();
      return devices.some((device) => device.serial === owned.device.serial)
        ? null
        : true;
    },
    {
      timeoutMs: 20_000,
      intervalMs: 500,
      description: `ADB serial ${owned.device.serial} to disconnect`,
    }
  );
}
