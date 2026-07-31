import fs from "node:fs";
import path from "node:path";

export interface AndroidSdkTools {
  root: string;
  adb: string;
  emulator: string;
  aapt: string;
}

function existingDirectory(candidates: Array<string | undefined>): string {
  const found = candidates.find(
    (candidate): candidate is string =>
      Boolean(candidate) && fs.existsSync(candidate as string)
  );
  if (!found) {
    throw new Error(
      "Android SDK not found. Set ANDROID_SDK_ROOT or ANDROID_HOME."
    );
  }
  return path.resolve(found);
}

function executable(root: string, relative: string): string {
  const value = path.join(root, relative);
  if (!fs.existsSync(value)) {
    throw new Error(`Required Android SDK executable not found: ${value}`);
  }
  return value;
}

function versionParts(value: string): number[] {
  return value.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function compareBuildToolVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function resolveAndroidSdkTools(
  env: Record<string, string | undefined> = Bun.env
): AndroidSdkTools {
  const localAppData = env.LOCALAPPDATA;
  const root = existingDirectory([
    env.ANDROID_SDK_ROOT,
    env.ANDROID_HOME,
    localAppData ? path.join(localAppData, "Android", "Sdk") : undefined,
  ]);
  const executableSuffix = process.platform === "win32" ? ".exe" : "";
  const buildToolsRoot = path.join(root, "build-tools");
  const versions = fs
    .readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareBuildToolVersions)
    .reverse();
  const aaptVersion = versions.find((version) =>
    fs.existsSync(path.join(buildToolsRoot, version, `aapt${executableSuffix}`))
  );
  if (!aaptVersion) throw new Error("Android SDK aapt executable not found.");
  return {
    root,
    adb: executable(root, path.join("platform-tools", `adb${executableSuffix}`)),
    emulator: executable(root, path.join("emulator", `emulator${executableSuffix}`)),
    aapt: executable(
      root,
      path.join("build-tools", aaptVersion, `aapt${executableSuffix}`)
    ),
  };
}
