// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type AndroidArtifactKind = "apk" | "aab";
export type AndroidBuildProfile = "debug" | "release";

export interface AndroidBuildOptions {
  buildApk: boolean;
  buildAab: boolean;
  profile: AndroidBuildProfile;
  splitPerAbi: boolean;
  targetAbis: string[];
}

export interface AndroidArtifact {
  kind: AndroidArtifactKind;
  sourcePath: string;
  abi: string;
  profile: AndroidBuildProfile;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const mobileRoot = path.join(repoRoot, "mobile");
const androidOutputsRoot = path.join(
  mobileRoot,
  "src-tauri",
  "gen",
  "android",
  "app",
  "build",
  "outputs"
);
const normalizedOutputsRoot = path.join(
  mobileRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "android"
);

const targetToAbi: Record<string, string> = {
  aarch64: "arm64-v8a",
  armv7: "armeabi-v7a",
  i686: "x86",
  x86_64: "x86_64",
};

function isOption(value: string): boolean {
  return value.startsWith("-");
}

export function parseBuildOptions(args: string[]): AndroidBuildOptions {
  const hasApk = args.includes("--apk");
  const hasAab = args.includes("--aab");
  const targetIndex = args.indexOf("--target");
  const targetAbis: string[] = [];

  if (targetIndex >= 0) {
    for (const target of args.slice(targetIndex + 1)) {
      if (isOption(target)) {
        break;
      }
      const abi = targetToAbi[target];
      if (abi && !targetAbis.includes(abi)) {
        targetAbis.push(abi);
      }
    }
  }

  return {
    buildApk: hasApk || !hasAab,
    buildAab: hasAab || !hasApk,
    profile: args.includes("--debug") ? "debug" : "release",
    splitPerAbi: args.includes("--split-per-abi"),
    targetAbis,
  };
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function getApkAbi(filePath: string, apkRoot: string): string | null {
  const relative = path.relative(apkRoot, filePath);
  const parts = relative.split(path.sep);
  return parts.length >= 3 ? parts[0] : null;
}

function isProfilePath(
  filePath: string,
  profile: AndroidBuildProfile
): boolean {
  const normalized = filePath.split(path.sep).join("/").toLowerCase();
  if (filePath.toLowerCase().endsWith(".apk")) {
    return normalized.includes(`/apk/`) && normalized.includes(`/${profile}/`);
  }
  return normalized.includes(`/bundle/`) && normalized.includes(profile);
}

export function collectAndroidArtifacts(
  outputsRoot: string,
  options: AndroidBuildOptions
): AndroidArtifact[] {
  const apkRoot = path.join(outputsRoot, "apk");
  const bundleRoot = path.join(outputsRoot, "bundle");
  const artifacts: AndroidArtifact[] = [];

  if (options.buildApk) {
    const apkFiles = walkFiles(apkRoot).filter(
      (filePath) =>
        filePath.toLowerCase().endsWith(".apk") &&
        isProfilePath(filePath, options.profile) &&
        !filePath.toLowerCase().endsWith("-unsigned.apk")
    );
    let selectedApkFiles: string[];
    if (options.splitPerAbi) {
      selectedApkFiles = apkFiles.filter((filePath) => {
        const abi = getApkAbi(filePath, apkRoot);
        return abi !== null && abi !== "universal";
      });
    } else if (options.targetAbis.length > 0) {
      selectedApkFiles = apkFiles.filter((filePath) => {
        const abi = getApkAbi(filePath, apkRoot);
        return options.targetAbis.includes(abi ?? "");
      });
      if (selectedApkFiles.length === 0) {
        // Tauri may place a single-target APK in the universal flavor directory.
        selectedApkFiles = apkFiles.filter(
          (filePath) => getApkAbi(filePath, apkRoot) === "universal"
        );
      }
    } else {
      selectedApkFiles = apkFiles.filter(
        (filePath) => getApkAbi(filePath, apkRoot) === "universal"
      );
    }

    for (const sourcePath of selectedApkFiles) {
      const outputAbi = getApkAbi(sourcePath, apkRoot);
      if (outputAbi) {
        const abi =
          outputAbi === "universal" && options.targetAbis.length === 1
            ? options.targetAbis[0]
            : outputAbi;
        artifacts.push({
          kind: "apk",
          sourcePath,
          abi,
          profile: options.profile,
        });
      }
    }
  }

  if (options.buildAab) {
    const bundleFiles = walkFiles(bundleRoot).filter(
      (filePath) =>
        filePath.toLowerCase().endsWith(".aab") &&
        isProfilePath(filePath, options.profile)
    );
    for (const sourcePath of bundleFiles) {
      artifacts.push({
        kind: "aab",
        sourcePath,
        abi: "universal",
        profile: options.profile,
      });
    }
  }

  return artifacts;
}

function sanitizeNamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]/g, "-");
}

export function buildArtifactName(
  productName: string,
  version: string,
  artifact: Pick<AndroidArtifact, "kind" | "abi" | "profile">
): string {
  const product = sanitizeNamePart(productName);
  const safeVersion = sanitizeNamePart(version);
  return `${product}_${safeVersion}_android-${artifact.abi}-${artifact.profile}.${artifact.kind}`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function loadAppIdentity(): { productName: string; version: string } {
  const config = readJson<{ productName: string; version: string }>(
    path.join(mobileRoot, "src-tauri", "tauri.conf.json")
  );
  const packageJson = readJson<{ version: string }>(
    path.join(mobileRoot, "package.json")
  );

  if (config.version !== packageJson.version) {
    throw new Error(
      `移动端版本不一致: tauri.conf.json=${config.version}, package.json=${packageJson.version}`
    );
  }

  return { productName: config.productName, version: config.version };
}

function exportArtifacts(
  artifacts: AndroidArtifact[],
  identity: { productName: string; version: string },
  profile: AndroidBuildProfile
): string[] {
  fs.mkdirSync(normalizedOutputsRoot, { recursive: true });
  const prefix = `${sanitizeNamePart(identity.productName)}_`;
  for (const entry of fs.readdirSync(normalizedOutputsRoot, {
    withFileTypes: true,
  })) {
    if (entry.isFile() && entry.name.startsWith(prefix)) {
      fs.rmSync(path.join(normalizedOutputsRoot, entry.name));
    }
  }

  return artifacts.map((artifact) => {
    const fileName = buildArtifactName(identity.productName, identity.version, {
      ...artifact,
      profile,
    });
    const destination = path.join(normalizedOutputsRoot, fileName);
    fs.copyFileSync(artifact.sourcePath, destination);
    return destination;
  });
}

function run(): void {
  const args = process.argv.slice(2);
  const options = parseBuildOptions(args);
  const identity = loadAppIdentity();

  console.log(
    `[Android Build] 构建 ${identity.productName} v${identity.version} (${options.profile})...`
  );

  const result = spawnSync(
    "bun",
    ["run", "tauri", "android", "build", ...args],
    {
      cwd: mobileRoot,
      env: process.env,
      shell: true,
      stdio: "inherit",
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const artifacts = collectAndroidArtifacts(androidOutputsRoot, options);
  if (artifacts.length === 0) {
    throw new Error(
      `构建完成但未找到 ${options.profile} Android 产物，请检查: ${androidOutputsRoot}`
    );
  }

  const exportedPaths = exportArtifacts(artifacts, identity, options.profile);
  console.log("\n[Android Build] 已整理带版本号的产物:");
  for (const outputPath of exportedPaths) {
    console.log(`  ${outputPath}`);
  }
}

if (import.meta.main) {
  try {
    run();
  } catch (error) {
    console.error(
      `[Android Build] 构建失败: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
