import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AdbClient } from "./adb";

const IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP4z8AAQTAxIgoYGBgAABkAAfY6f4EAAAAASUVORK5CYII=";
const NOTE_TEXT = "AIO Hub Android E2E deterministic fixture.\n";

function createWavFixture() {
  const sampleRate = 8_000;
  const samples = Buffer.alloc(sampleRate / 2, 128);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

export interface PreparedFixtures {
  hostDirectory: string;
  deviceDirectory: string;
  image: { fileName: string; hostPath: string; devicePath: string; bytes: number; sha256: string };
  note: { fileName: string; hostPath: string; devicePath: string; bytes: number; sha256: string };
  audio: { fileName: string; hostPath: string; devicePath: string; bytes: number; sha256: string };
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
  const audioFileName = `aiohub-e2e-audio-${suffix}.wav`;
  fs.mkdirSync(hostDirectory, { recursive: true });
  const imageHostPath = path.join(hostDirectory, imageFileName);
  const noteHostPath = path.join(hostDirectory, noteFileName);
  const audioHostPath = path.join(hostDirectory, audioFileName);
  fs.writeFileSync(imageHostPath, Buffer.from(IMAGE_BASE64, "base64"));
  fs.writeFileSync(noteHostPath, NOTE_TEXT, "utf8");
  fs.writeFileSync(audioHostPath, createWavFixture());
  await options.adb.serial(options.serial, ["shell", "mkdir", "-p", deviceDirectory]);
  const imageDevicePath = `${deviceDirectory}/${imageFileName}`;
  const noteDevicePath = `${deviceDirectory}/${noteFileName}`;
  const audioDevicePath = `${deviceDirectory}/${audioFileName}`;
  await options.adb.push(options.serial, imageHostPath, imageDevicePath);
  await options.adb.push(options.serial, noteHostPath, noteDevicePath);
  await options.adb.push(options.serial, audioHostPath, audioDevicePath);
  await options.adb.serial(options.serial, [
    "shell",
    "am",
    "broadcast",
    "-a",
    "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
    "-d",
    `file://${imageDevicePath}`,
  ]);
  await options.adb.serial(options.serial, [
    "shell",
    "am",
    "broadcast",
    "-a",
    "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
    "-d",
    `file://${audioDevicePath}`,
  ]);
  // DocumentsUI queries MediaStore asynchronously after the scanner broadcast.
  // Wait on the selected device so a just-pushed audio fixture is selectable.
  await options.adb.serial(options.serial, ["shell", "sleep", "2"]);
  return {
    hostDirectory,
    deviceDirectory,
    image: metadata(imageHostPath, imageDevicePath),
    note: metadata(noteHostPath, noteDevicePath),
    audio: metadata(audioHostPath, audioDevicePath),
  };
}
