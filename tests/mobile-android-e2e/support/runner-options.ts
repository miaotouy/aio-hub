import path from "node:path";

export type MobileE2ePresetId =
  | "feasibility"
  | "smoke"
  | "asset"
  | "media"
  | "rich-text"
  | "attachment"
  | "recovery"
  | "core"
  | "ollama";

export interface MobileE2eOptions {
  preset: MobileE2ePresetId;
  avdName: string;
  serial?: string;
  apkPath?: string;
  artifactDir: string;
  build: boolean;
  clearAppData: boolean;
  keepAvd: boolean;
  appiumPort: number;
  requireOllama: boolean;
  ollamaModel?: string;
  listPresets: boolean;
  maxApkBytes?: number;
  chromedriverPath?: string;
}

const PRESETS = new Set<MobileE2ePresetId>([
  "feasibility",
  "smoke",
  "asset",
  "media",
  "rich-text",
  "attachment",
  "recovery",
  "core",
  "ollama",
]);

function valueAfter(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${value}.`);
  }
  return parsed;
}

export function parseRunnerOptions(
  args: string[],
  env: Record<string, string | undefined>,
  repoRoot: string
): MobileE2eOptions {
  const presetValue = valueAfter(args, "--preset") ?? "smoke";
  if (!PRESETS.has(presetValue as MobileE2ePresetId)) {
    throw new Error(`Unknown mobile E2E preset: ${presetValue}`);
  }
  const apkPath = valueAfter(args, "--apk") ?? env.AIO_MOBILE_E2E_APK;
  const build = !args.includes("--no-build") && !apkPath;
  if (!build && !apkPath) {
    throw new Error("--no-build requires --apk or AIO_MOBILE_E2E_APK.");
  }
  const maxBytes =
    valueAfter(args, "--max-apk-bytes") ?? env.AIO_MOBILE_E2E_MAX_APK_BYTES;
  return {
    preset: presetValue as MobileE2ePresetId,
    avdName:
      valueAfter(args, "--avd") ??
      env.AIO_MOBILE_E2E_AVD ??
      "Medium_Phone_API_36",
    serial: valueAfter(args, "--serial") ?? env.AIO_MOBILE_E2E_SERIAL,
    apkPath: apkPath ? path.resolve(repoRoot, apkPath) : undefined,
    artifactDir: path.resolve(
      repoRoot,
      valueAfter(args, "--artifacts") ??
        env.AIO_MOBILE_E2E_ARTIFACT_DIR ??
        path.join(".dev-data", "mobile-android-e2e")
    ),
    build,
    clearAppData: !args.includes("--keep-app-data"),
    keepAvd: args.includes("--keep-avd"),
    appiumPort: positiveInteger(
      valueAfter(args, "--appium-port") ?? env.AIO_MOBILE_E2E_APPIUM_PORT,
      4723
    ),
    requireOllama:
      args.includes("--require-ollama") ||
      env.AIO_MOBILE_E2E_REQUIRE_OLLAMA === "1",
    ollamaModel:
      valueAfter(args, "--ollama-model") ?? env.AIO_MOBILE_E2E_OLLAMA_MODEL,
    listPresets: args.includes("--list-presets"),
    maxApkBytes: maxBytes ? positiveInteger(maxBytes, 0) : undefined,
    chromedriverPath:
      valueAfter(args, "--chromedriver") ?? env.AIO_MOBILE_E2E_CHROMEDRIVER,
  };
}
