import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AdbClient } from "./adb";

const IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP4z8AAQTAxIgoYGBgAABkAAfY6f4EAAAAASUVORK5CYII=";
const NOTE_TEXT = "AIO Hub Android E2E deterministic fixture.\n";

export interface PreparedFixtures {
  hostDirectory: string;
  deviceDirectory: string;
  image: { fileName: string; hostPath: string; devicePath: string; bytes: number; sha256: string };
  note: { fileName: string; hostPath: string; devicePath: string; bytes: number; sha256: string };
}

function metadata(hostPath: string, devicePath: string) {
  const bytes = fs.readFileSync(hostPath);
  return {
    fileName: path.basename(devicePath),
    hostPath,
    devicePath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function prepareFixtures(options: {
  artifactDir: string;
  adb: AdbClient;
  serial: string;
}): Promise<PreparedFixtures> {
  const hostDirectory = path.join(options.artifactDir, "fixtures");
  const deviceDirectory = "/sdcard/Download";
  const suffix = path
    .basename(options.artifactDir)
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(-18);
  const imageFileName = `aiohub-e2e-image-${suffix}.png`;
  const noteFileName = `aiohub-e2e-note-${suffix}.txt`;
  fs.mkdirSync(hostDirectory, { recursive: true });
  const imageHostPath = path.join(hostDirectory, imageFileName);
  const noteHostPath = path.join(hostDirectory, noteFileName);
  fs.writeFileSync(imageHostPath, Buffer.from(IMAGE_BASE64, "base64"));
  fs.writeFileSync(noteHostPath, NOTE_TEXT, "utf8");
  await options.adb.serial(options.serial, ["shell", "mkdir", "-p", deviceDirectory]);
  const imageDevicePath = `${deviceDirectory}/${imageFileName}`;
  const noteDevicePath = `${deviceDirectory}/${noteFileName}`;
  await options.adb.push(options.serial, imageHostPath, imageDevicePath);
  await options.adb.push(options.serial, noteHostPath, noteDevicePath);
  await options.adb.serial(options.serial, [
    "shell",
    "am",
    "broadcast",
    "-a",
    "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
    "-d",
    `file://${imageDevicePath}`,
  ]);
  return {
    hostDirectory,
    deviceDirectory,
    image: metadata(imageHostPath, imageDevicePath),
    note: metadata(noteHostPath, noteDevicePath),
  };
}
