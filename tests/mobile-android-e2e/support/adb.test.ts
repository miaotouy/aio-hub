import { describe, expect, it } from "vitest";
import { AdbClient, parseAdbDevices } from "./adb";
import type { CommandRunner } from "./process";

describe("ADB device boundaries", () => {
  it("parses all connected devices without treating emulator serials as AVD proof", () => {
    expect(
      parseAdbDevices(`List of devices attached
emulator-5554 device product:sdk model:sdk_gphone64_x86_64 device:emu transport_id:1
emulator-5556 device product:NX809J model:NX809J device:unicorn transport_id:2
`)
    ).toEqual([
      {
        serial: "emulator-5554",
        state: "device",
        product: "sdk",
        model: "sdk_gphone64_x86_64",
        device: "emu",
        transportId: "1",
      },
      {
        serial: "emulator-5556",
        state: "device",
        product: "NX809J",
        model: "NX809J",
        device: "unicorn",
        transportId: "2",
      },
    ]);
  });

  it("puts the explicit serial before every device mutation", async () => {
    const calls: string[][] = [];
    const run: CommandRunner = async (command) => {
      calls.push(command);
      return { command, exitCode: 0, stdout: "Success\n", stderr: "" };
    };
    const adb = new AdbClient("sdk-adb", run);
    await adb.install("emulator-5554", "test.apk");
    await adb.clearAppData("emulator-5554", "com.aiohub.mobile");
    await adb.reverse("emulator-5554", 11434, 11434);
    await adb.dismissSystemPickers("emulator-5554");
    expect(calls).toEqual([
      ["sdk-adb", "-s", "emulator-5554", "install", "-r", "-t", "test.apk"],
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "shell",
        "pm",
        "clear",
        "com.aiohub.mobile",
      ],
      ["sdk-adb", "-s", "emulator-5554", "reverse", "tcp:11434", "tcp:11434"],
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "shell",
        "am",
        "force-stop",
        "com.google.android.documentsui",
      ],
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "shell",
        "am",
        "force-stop",
        "com.android.documentsui",
      ],
    ]);
  });

  it("rejects a blank serial", async () => {
    const adb = new AdbClient("sdk-adb", async () => {
      throw new Error("must not run");
    });
    await expect(adb.serial("", ["shell", "true"])).rejects.toThrow(
      "ADB serial is required"
    );
  });

  it("reads the target application PID without an implicit device", async () => {
    const calls: string[][] = [];
    const adb = new AdbClient("sdk-adb", async (command) => {
      calls.push(command);
      return { command, exitCode: 0, stdout: "1234\n", stderr: "" };
    });
    await expect(adb.pidOf("emulator-5554", "com.aiohub.mobile")).resolves.toBe(
      1234
    );
    expect(calls).toEqual([
      ["sdk-adb", "-s", "emulator-5554", "shell", "pidof", "com.aiohub.mobile"],
    ]);
  });

  it("limits download mutations to deterministic E2E files", async () => {
    const calls: string[][] = [];
    const adb = new AdbClient("sdk-adb", async (command) => {
      calls.push(command);
      return { command, exitCode: 0, stdout: "", stderr: "" };
    });
    await adb.removeTestDownload("emulator-5554", "aiohub-e2e-export.png");
    await adb.createTestDownload(
      "emulator-5554",
      "aiohub-e2e-interrupted.bin",
      768
    );
    await adb.pullTestDownload(
      "emulator-5554",
      "aiohub-e2e-export.png",
      "C:\\artifacts\\export.png"
    );
    await expect(
      adb.testDownloadSize("emulator-5554", "aiohub-e2e-export.png")
    ).resolves.toBeNull();
    expect(calls).toEqual([
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "shell",
        "rm",
        "-f",
        "/sdcard/Download/aiohub-e2e-export.png",
      ],
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "shell",
        "dd",
        "if=/dev/zero",
        "of=/sdcard/Download/aiohub-e2e-interrupted.bin",
        "bs=1048576",
        "count=768",
        "conv=fsync",
      ],
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "pull",
        "/sdcard/Download/aiohub-e2e-export.png",
        "C:\\artifacts\\export.png",
      ],
      [
        "sdk-adb",
        "-s",
        "emulator-5554",
        "shell",
        "stat",
        "-c",
        "%s",
        "/sdcard/Download/aiohub-e2e-export.png",
      ],
    ]);
    await expect(
      adb.removeTestDownload("emulator-5554", "../outside")
    ).rejects.toThrow("Unsafe Android E2E download name");
    await expect(
      adb.createTestDownload("emulator-5554", "aiohub-e2e-too-large.bin", 1_025)
    ).rejects.toThrow("Unsafe Android E2E download size");
  });
});
