import fs from "node:fs";
import {
  APP_TARGETS,
  type AppTarget,
  expectedTag,
  readCargoVersion,
  readJson,
  readTargetVersion,
  resolveTauriVersion,
  SEMVER_PATTERN,
} from "./app-version";

const INTERNAL_CARGO_VERSION = "0.0.0";

interface TauriConfig {
  [key: string]: unknown;
  bundle?: {
    [key: string]: unknown;
    android?: {
      [key: string]: unknown;
      versionCode?: number;
    };
  };
}

function usage(): never {
  throw new Error(
    "用法: bun run version:set -- <desktop|mobile> <version> [--android-version-code <number>]\n" +
      "或: bun run version:check -- [--target <desktop|mobile>] [--tag <tag>] [--tag-prefix <prefix>]"
  );
}

function parseTarget(value: string | undefined): AppTarget {
  if (value === "desktop" || value === "mobile") return value;
  usage();
}

function preserveJson(filePath: string, value: unknown): void {
  const original = fs.readFileSync(filePath, "utf8");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const serialized = JSON.stringify(value, null, 2).replaceAll("\n", newline);
  fs.writeFileSync(filePath, `${serialized}${newline}`);
}

function parseOptions(args: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) usage();
    options.set(arg.slice(2), value);
    index += 1;
  }
  return options;
}

function setVersion(args: string[]): void {
  const target = parseTarget(args[0]);
  const version = args[1];
  if (!version || !SEMVER_PATTERN.test(version)) {
    throw new Error(`非法 SemVer: ${version ?? "(empty)"}`);
  }

  const options = parseOptions(args.slice(2));
  const paths = APP_TARGETS[target];
  const packageJson = readJson<Record<string, unknown>>(paths.packageJson);
  const currentVersion = packageJson.version;
  let mobileConfig: TauriConfig | undefined;
  let nextCode: number | undefined;

  if (target === "mobile") {
    mobileConfig = readJson<TauriConfig>(paths.tauriConfig);
    const configuredCode = mobileConfig.bundle?.android?.versionCode;
    const requestedCode = options.get("android-version-code");
    nextCode = requestedCode
      ? Number(requestedCode)
      : currentVersion === version
        ? Number(configuredCode ?? 1001)
        : Number(configuredCode ?? 1000) + 1;
    if (
      !Number.isSafeInteger(nextCode) ||
      nextCode < 1 ||
      nextCode > 2_100_000_000
    ) {
      throw new Error(`非法 Android versionCode: ${requestedCode ?? nextCode}`);
    }
  }

  packageJson.version = version;
  preserveJson(paths.packageJson, packageJson);
  if (mobileConfig && nextCode) {
    mobileConfig.bundle ??= {};
    mobileConfig.bundle.android ??= {};
    mobileConfig.bundle.android.versionCode = nextCode;
    preserveJson(paths.tauriConfig, mobileConfig);
    console.log(`移动端 Android versionCode: ${nextCode}`);
  }
  console.log(`${target} 版本已更新为 ${version}`);
}

function checkTarget(
  target: AppTarget,
  tag?: string,
  tagPrefix?: string
): void {
  const packageVersion = readTargetVersion(target);
  if (!SEMVER_PATTERN.test(packageVersion)) {
    throw new Error(
      `${target} package.json 不是合法 SemVer: ${packageVersion}`
    );
  }

  const tauriVersion = resolveTauriVersion(APP_TARGETS[target].tauriConfig);
  if (tauriVersion !== packageVersion) {
    throw new Error(
      `${target} Tauri/package 版本不一致: ${tauriVersion} !== ${packageVersion}`
    );
  }

  const cargoVersion = readCargoVersion(target);
  if (cargoVersion !== INTERNAL_CARGO_VERSION) {
    throw new Error(
      `${target} Cargo crate 版本应为 ${INTERNAL_CARGO_VERSION}: ${cargoVersion}`
    );
  }

  if (target === "mobile") {
    const config = readJson<TauriConfig>(APP_TARGETS.mobile.tauriConfig);
    const versionCode = config.bundle?.android?.versionCode;
    if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
      throw new Error(`移动端缺少合法 Android versionCode: ${versionCode}`);
    }
  }

  if (tag) {
    const expected = tagPrefix
      ? `${tagPrefix}${packageVersion}`
      : expectedTag(target, packageVersion);
    if (tag !== expected) {
      throw new Error(`${target} tag 不匹配: ${tag} !== ${expected}`);
    }
  }
}

function checkVersions(args: string[]): void {
  const options = parseOptions(args);
  const targetValue = options.get("target");
  const targets: AppTarget[] = targetValue
    ? [parseTarget(targetValue)]
    : ["desktop", "mobile"];
  const tag = options.get("tag");
  const tagPrefix = options.get("tag-prefix");
  for (const target of targets) checkTarget(target, tag, tagPrefix);
  console.log(`版本检查通过: ${targets.join(", ")}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "set") setVersion(args);
else if (command === "check") checkVersions(args);
else usage();
