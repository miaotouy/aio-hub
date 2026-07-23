import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AndroidAbi, ApkMetadata, TauriAndroidTarget } from "../types";
import { ANDROID_ABIS } from "../types";
import type { AndroidSdkTools } from "./android-sdk";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

const ABI_TARGETS: Record<AndroidAbi, TauriAndroidTarget> = {
  x86_64: "x86_64",
  x86: "i686",
  "arm64-v8a": "aarch64",
  "armeabi-v7a": "armv7",
};

export function tauriTargetForAbi(abi: AndroidAbi): TauriAndroidTarget {
  return ABI_TARGETS[abi];
}

export function parseApkNativeAbis(entries: string): AndroidAbi[] {
  const found = new Set<AndroidAbi>();
  for (const line of entries.split(/\r?\n/)) {
    const match = line.trim().match(/^lib\/([^/]+)\/[^/]+\.so$/);
    if (match && ANDROID_ABIS.includes(match[1] as AndroidAbi)) {
      found.add(match[1] as AndroidAbi);
    }
  }
  return ANDROID_ABIS.filter((abi) => found.has(abi));
}

export function verifyApkAbi(
  apkPath: string,
  nativeAbis: AndroidAbi[],
  expectedAbi: AndroidAbi
): void {
  if (nativeAbis.length !== 1 || nativeAbis[0] !== expectedAbi) {
    throw new Error(
      `APK must contain only ${expectedAbi}; found ${nativeAbis.join(", ") || "none"}.`
    );
  }
  const claim = path
    .basename(apkPath)
    .match(/android-(x86_64|x86|arm64-v8a|armeabi-v7a|universal)-/i)?.[1];
  if (claim && claim.toLowerCase() !== expectedAbi.toLowerCase()) {
    throw new Error(
      `APK filename claims ${claim}, but package contains ${expectedAbi}.`
    );
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inspectApk(options: {
  apkPath: string;
  expectedAbi: AndroidAbi;
  tools: AndroidSdkTools;
  run?: CommandRunner;
}): Promise<ApkMetadata> {
  const apkPath = path.resolve(options.apkPath);
  if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);
  const run = options.run ?? runCommand;
  const entries = await run([options.tools.aapt, "list", apkPath], {
    timeoutMs: 120_000,
  });
  const nativeAbis = parseApkNativeAbis(entries.stdout);
  verifyApkAbi(apkPath, nativeAbis, options.expectedAbi);
  const stat = fs.statSync(apkPath);
  return {
    path: apkPath,
    sha256: await hashFile(apkPath),
    bytes: stat.size,
    nativeAbis,
  };
}

export function findBuiltApk(
  repoRoot: string,
  abi: AndroidAbi,
  profile: "debug" | "release" = "debug"
): string {
  const bundleRoot = path.join(
    repoRoot,
    "mobile",
    "src-tauri",
    "target",
    "release",
    "bundle",
    "android"
  );
  const suffix = `_android-${abi}-${profile}.apk`;
  const matches = fs.existsSync(bundleRoot)
    ? fs
        .readdirSync(bundleRoot)
        .filter((name) => name.endsWith(suffix))
        .map((name) => path.join(bundleRoot, name))
    : [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${abi} ${profile} APK in ${bundleRoot}; found ${matches.length}.`
    );
  }
  return matches[0];
}

export async function buildE2eApk(options: {
  repoRoot: string;
  target: TauriAndroidTarget;
  run?: CommandRunner;
}): Promise<string> {
  const run = options.run ?? runCommand;
  await run(
    [
      "bun",
      "scripts/build-android.ts",
      "--apk",
      "--debug",
      "--target",
      options.target,
      "--ci",
      "--e2e",
    ],
    { cwd: options.repoRoot, timeoutMs: 30 * 60_000 }
  );
  const abi = Object.entries(ABI_TARGETS).find(
    ([, target]) => target === options.target
  )?.[0] as AndroidAbi | undefined;
  if (!abi) throw new Error(`Unsupported Tauri Android target: ${options.target}`);
  return findBuiltApk(options.repoRoot, abi);
}
