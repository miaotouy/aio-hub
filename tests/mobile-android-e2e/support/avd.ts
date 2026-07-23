import fs from "node:fs";
import path from "node:path";
import type { Subprocess } from "bun";
import type { AndroidStudioAvd, ConnectedAndroidDevice } from "../types";
import type { AndroidSdkTools } from "./android-sdk";
import { AdbClient } from "./adb";
import type { CommandRunner } from "./process";
import { runCommand, waitUntil } from "./process";

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
    const device = devices.find((candidate) => candidate.serial === requestedSerial);
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
    }
  );
  const previousSerials = new Set(before.all.map((device) => device.serial));
  try {
    const device = await waitUntil(
      async () => {
        if (process.exitCode !== null) {
          throw new Error(`AVD process exited with code ${process.exitCode}.`);
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
    process.kill();
    throw error;
  }
}

export async function stopOwnedAvd(adb: AdbClient, owned: OwnedAvd) {
  if (!owned.startedByRunner) return;
  await adb.serial(owned.device.serial, ["emu", "kill"], {
    allowFailure: true,
    timeoutMs: 10_000,
  });
  owned.process?.kill();
}
