import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AdbClient } from "./adb";

const IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP4z8AAQTAxIgoYGBgAABkAAfY6f4EAAAAASUVORK5CYII=";
const NOTE_TEXT = "AIO Hub Android E2E deterministic fixture.\n";
// Three-second 160x90 H.264 Constrained Baseline MP4 generated once during test
// authoring. Keeping the tiny fixture inline avoids a FFmpeg runtime dependency.
const VIDEO_BASE64 =
  "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";

function createWavFixture() {
  const sampleRate = 8_000;
  // Keep this longer than the playback assertion so Android WebView can advance
  // currentTime before the fixture ends, even on a loaded AVD.
  const samples = Buffer.alloc(sampleRate * 3, 128);
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
  image: {
    fileName: string;
    hostPath: string;
    devicePath: string;
    bytes: number;
    sha256: string;
  };
  note: {
    fileName: string;
    hostPath: string;
    devicePath: string;
    bytes: number;
    sha256: string;
  };
  audio: {
    fileName: string;
    hostPath: string;
    devicePath: string;
    bytes: number;
    sha256: string;
  };
  video: {
    fileName: string;
    hostPath: string;
    devicePath: string;
    bytes: number;
    sha256: string;
  };
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
  const videoFileName = `aiohub-e2e-video-${suffix}.mp4`;
  fs.mkdirSync(hostDirectory, { recursive: true });
  const imageHostPath = path.join(hostDirectory, imageFileName);
  const noteHostPath = path.join(hostDirectory, noteFileName);
  const audioHostPath = path.join(hostDirectory, audioFileName);
  const videoHostPath = path.join(hostDirectory, videoFileName);
  fs.writeFileSync(imageHostPath, Buffer.from(IMAGE_BASE64, "base64"));
  fs.writeFileSync(noteHostPath, NOTE_TEXT, "utf8");
  fs.writeFileSync(audioHostPath, createWavFixture());
  fs.writeFileSync(videoHostPath, Buffer.from(VIDEO_BASE64, "base64"));
  await options.adb.serial(options.serial, [
    "shell",
    "mkdir",
    "-p",
    deviceDirectory,
  ]);
  const imageDevicePath = `${deviceDirectory}/${imageFileName}`;
  const noteDevicePath = `${deviceDirectory}/${noteFileName}`;
  const audioDevicePath = `${deviceDirectory}/${audioFileName}`;
  const videoDevicePath = `${deviceDirectory}/${videoFileName}`;
  await options.adb.push(options.serial, imageHostPath, imageDevicePath);
  await options.adb.push(options.serial, noteHostPath, noteDevicePath);
  await options.adb.push(options.serial, audioHostPath, audioDevicePath);
  await options.adb.push(options.serial, videoHostPath, videoDevicePath);
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
  await options.adb.serial(options.serial, [
    "shell",
    "am",
    "broadcast",
    "-a",
    "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
    "-d",
    `file://${videoDevicePath}`,
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
    video: metadata(videoHostPath, videoDevicePath),
  };
}
