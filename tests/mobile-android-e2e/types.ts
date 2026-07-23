export const ANDROID_ABIS = [
  "x86_64",
  "x86",
  "arm64-v8a",
  "armeabi-v7a",
] as const;

export type AndroidAbi = (typeof ANDROID_ABIS)[number];
export type TauriAndroidTarget = "x86_64" | "i686" | "aarch64" | "armv7";

export interface ConnectedAndroidDevice {
  serial: string;
  state: string;
  product?: string;
  model?: string;
  device?: string;
  transportId?: string;
}

export interface AndroidStudioAvd extends ConnectedAndroidDevice {
  state: "device";
  avdName: string;
  sdk: number;
  primaryAbi: AndroidAbi;
  abiList: string[];
  isQemu: true;
}

export interface ApkMetadata {
  path: string;
  sha256: string;
  bytes: number;
  nativeAbis: AndroidAbi[];
}

export interface ScenarioResult {
  id: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  detail?: string;
}

export interface MobileE2eRunResult {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  preset: string;
  status: "running" | "passed" | "failed" | "skipped";
  device?: {
    serial: string;
    avdName: string;
    model?: string;
    sdk: number;
    primaryAbi: AndroidAbi;
    abiList: string[];
    startedByRunner: boolean;
  };
  apk?: ApkMetadata & { tauriTarget: TauriAndroidTarget };
  appium?: {
    version: string;
    uiautomator2Version: string;
    contexts: string[];
  };
  network?: {
    deterministicBaseUrl?: string;
    adbReverse: boolean;
    reverseMappings?: Array<{
      devicePort: number;
      hostPort: number;
      purpose: "deterministic-openai" | "ollama";
    }>;
    ollama?: unknown;
  };
  warnings: string[];
  scenarios: ScenarioResult[];
  error?: { name: string; message: string };
}
