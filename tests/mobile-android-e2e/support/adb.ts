import type {
  AndroidAbi,
  AndroidStudioAvd,
  ConnectedAndroidDevice,
} from "../types";
import { ANDROID_ABIS } from "../types";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

const TEST_DOWNLOAD_NAME = /^aiohub-e2e-[A-Za-z0-9._-]+$/;
const DOCUMENTS_UI_PACKAGES = [
  "com.google.android.documentsui",
  "com.android.documentsui",
] as const;

function testDownloadPath(fileName: string): string {
  if (!TEST_DOWNLOAD_NAME.test(fileName)) {
    throw new Error(`Unsafe Android E2E download name: ${fileName}`);
  }
  return `/sdcard/Download/${fileName}`;
}

export function parseAdbDevices(output: string): ConnectedAndroidDevice[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial = "", state = "", ...fields] = line.split(/\s+/);
      const metadata = Object.fromEntries(
        fields
          .map((field) => field.split(/:(.*)/s).slice(0, 2))
          .filter(([key, value]) => key && value)
      );
      return {
        serial,
        state,
        product: metadata.product,
        model: metadata.model,
        device: metadata.device,
        transportId: metadata.transport_id,
      };
    });
}

export class AdbClient {
  constructor(
    readonly executable: string,
    private readonly run: CommandRunner = runCommand
  ) {}

  async devices(): Promise<ConnectedAndroidDevice[]> {
    const result = await this.run([this.executable, "devices", "-l"]);
    return parseAdbDevices(result.stdout);
  }

  async serial(
    serial: string,
    args: string[],
    options: { allowFailure?: boolean; timeoutMs?: number } = {}
  ) {
    if (!serial.trim()) throw new Error("ADB serial is required.");
    return this.run([this.executable, "-s", serial, ...args], options);
  }

  async getProp(serial: string, name: string): Promise<string> {
    const result = await this.serial(serial, ["shell", "getprop", name]);
    return result.stdout.trim();
  }

  async avdName(serial: string): Promise<string | null> {
    const result = await this.serial(serial, ["emu", "avd", "name"], {
      allowFailure: true,
      timeoutMs: 5_000,
    });
    if (result.exitCode !== 0) return null;
    const name = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && line !== "OK");
    return name ?? null;
  }

  async inspectAvd(
    device: ConnectedAndroidDevice,
    configuredAvds: ReadonlySet<string>
  ): Promise<AndroidStudioAvd | null> {
    if (device.state !== "device") return null;
    const [qemu, avdName, sdkValue, abiValue, abiListValue] = await Promise.all(
      [
        this.getProp(device.serial, "ro.boot.qemu"),
        this.avdName(device.serial),
        this.getProp(device.serial, "ro.build.version.sdk"),
        this.getProp(device.serial, "ro.product.cpu.abi"),
        this.getProp(device.serial, "ro.product.cpu.abilist"),
      ]
    );
    if (qemu !== "1" || !avdName || !configuredAvds.has(avdName)) return null;
    if (!ANDROID_ABIS.includes(abiValue as AndroidAbi)) {
      throw new Error(
        `Unsupported Android ABI on ${device.serial}: ${abiValue}`
      );
    }
    const sdk = Number.parseInt(sdkValue, 10);
    if (!Number.isInteger(sdk)) {
      throw new Error(
        `Invalid Android SDK level on ${device.serial}: ${sdkValue}`
      );
    }
    return {
      ...device,
      state: "device",
      avdName,
      sdk,
      primaryAbi: abiValue as AndroidAbi,
      abiList: abiListValue.split(",").filter(Boolean),
      isQemu: true,
    };
  }

  async install(serial: string, apkPath: string): Promise<void> {
    await this.serial(serial, ["install", "-r", "-t", apkPath], {
      timeoutMs: 180_000,
    });
  }

  async clearAppData(serial: string, packageName: string): Promise<void> {
    const result = await this.serial(serial, [
      "shell",
      "pm",
      "clear",
      packageName,
    ]);
    if (!result.stdout.includes("Success")) {
      throw new Error(`Failed to clear ${packageName} on ${serial}.`);
    }
  }

  async dismissSystemPickers(serial: string): Promise<void> {
    for (const packageName of DOCUMENTS_UI_PACKAGES) {
      await this.serial(serial, ["shell", "am", "force-stop", packageName], {
        allowFailure: true,
        timeoutMs: 5_000,
      });
    }
  }

  async push(
    serial: string,
    source: string,
    destination: string
  ): Promise<void> {
    await this.serial(serial, ["push", source, destination]);
  }

  async removeTestDownload(serial: string, fileName: string): Promise<void> {
    await this.serial(serial, [
      "shell",
      "rm",
      "-f",
      testDownloadPath(fileName),
    ]);
  }

  async createTestDownload(
    serial: string,
    fileName: string,
    sizeMiB: number
  ): Promise<void> {
    if (!Number.isInteger(sizeMiB) || sizeMiB <= 0 || sizeMiB > 1_024) {
      throw new Error(`Unsafe Android E2E download size: ${sizeMiB}`);
    }
    await this.serial(
      serial,
      [
        "shell",
        "dd",
        "if=/dev/zero",
        `of=${testDownloadPath(fileName)}`,
        "bs=1048576",
        `count=${sizeMiB}`,
        "conv=fsync",
      ],
      { timeoutMs: 180_000 }
    );
  }

  async pullTestDownload(
    serial: string,
    fileName: string,
    destination: string
  ): Promise<void> {
    await this.serial(serial, [
      "pull",
      testDownloadPath(fileName),
      destination,
    ]);
  }

  async testDownloadSize(
    serial: string,
    fileName: string
  ): Promise<number | null> {
    const result = await this.serial(
      serial,
      ["shell", "stat", "-c", "%s", testDownloadPath(fileName)],
      { allowFailure: true, timeoutMs: 5_000 }
    );
    const size = Number.parseInt(result.stdout.trim(), 10);
    return result.exitCode === 0 && Number.isInteger(size) ? size : null;
  }

  async pidOf(serial: string, packageName: string): Promise<number | null> {
    const result = await this.serial(serial, ["shell", "pidof", packageName], {
      allowFailure: true,
      timeoutMs: 5_000,
    });
    const value = Number.parseInt(
      result.stdout.trim().split(/\s+/)[0] ?? "",
      10
    );
    return result.exitCode === 0 && Number.isInteger(value) ? value : null;
  }

  async reverse(serial: string, devicePort: number, hostPort: number) {
    return this.serial(serial, [
      "reverse",
      `tcp:${devicePort}`,
      `tcp:${hostPort}`,
    ]);
  }

  async removeReverse(serial: string, devicePort: number): Promise<void> {
    await this.serial(serial, ["reverse", "--remove", `tcp:${devicePort}`], {
      allowFailure: true,
    });
  }
}
