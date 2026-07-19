import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AppTarget = "desktop" | "mobile";

export interface AppTargetPaths {
  packageJson: string;
  tauriConfig: string;
  cargoManifest: string;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const APP_TARGETS: Record<AppTarget, AppTargetPaths> = {
  desktop: {
    packageJson: path.join(repoRoot, "package.json"),
    tauriConfig: path.join(repoRoot, "src-tauri", "tauri.conf.json"),
    cargoManifest: path.join(repoRoot, "src-tauri", "Cargo.toml"),
  },
  mobile: {
    packageJson: path.join(repoRoot, "mobile", "package.json"),
    tauriConfig: path.join(repoRoot, "mobile", "src-tauri", "tauri.conf.json"),
    cargoManifest: path.join(repoRoot, "mobile", "src-tauri", "Cargo.toml"),
  },
};

export const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function resolveTauriVersion(configPath: string): string {
  const config = readJson<{ version?: string | null }>(configPath);
  const configuredVersion = config.version;

  if (!configuredVersion) {
    throw new Error(`缺少 Tauri version 配置: ${configPath}`);
  }

  if (SEMVER_PATTERN.test(configuredVersion)) {
    return configuredVersion;
  }

  const referencedPath = path.resolve(
    path.dirname(configPath),
    configuredVersion
  );
  const packageJson = readJson<{ version?: string }>(referencedPath);
  if (!packageJson.version) {
    throw new Error(`版本引用文件缺少 version 字段: ${referencedPath}`);
  }

  return packageJson.version;
}

export function readTargetVersion(target: AppTarget): string {
  const paths = APP_TARGETS[target];
  return readJson<{ version: string }>(paths.packageJson).version;
}

export function expectedTag(target: AppTarget, version: string): string {
  return target === "desktop" ? `v${version}` : `mv${version}`;
}

export function readCargoVersion(target: AppTarget): string {
  const cargo = fs.readFileSync(APP_TARGETS[target].cargoManifest, "utf8");
  const match = cargo.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(
      `Cargo.toml 缺少 package version: ${APP_TARGETS[target].cargoManifest}`
    );
  }
  return match[1];
}
