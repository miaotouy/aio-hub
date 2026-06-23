import { getVersion } from "@tauri-apps/api/app";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { compareVersions } from "compare-versions";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("AppUpdater");

const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/miaotouy/aio-hub/releases/latest";
const GITHUB_RELEASES_URL = "https://github.com/miaotouy/aio-hub/releases";

export type AppUpdateSource = "tauri" | "github";

export interface AppUpdateInfo {
  source: AppUpdateSource;
  version: string;
  currentVersion: string;
  body: string;
  date?: string;
  url: string;
  installable: boolean;
}

export interface AppUpdateCheckOptions {
  forceShow?: boolean;
  timeoutMs?: number;
}

export interface AppUpdateCheckResult {
  available: boolean;
  info?: AppUpdateInfo;
  update?: Update;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, "");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  try {
    return compareVersions(
      normalizeVersion(latestVersion),
      normalizeVersion(currentVersion)
    ) > 0;
  } catch (error) {
    logger.warn("版本比较失败，按非相同版本处理", {
      latestVersion,
      currentVersion,
      error: getErrorMessage(error),
    });
    return latestVersion !== currentVersion;
  }
}

async function checkGitHubRelease(
  currentVersion: string,
  forceShow: boolean
): Promise<AppUpdateCheckResult> {
  const response = await fetch(GITHUB_LATEST_RELEASE_API);
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const release = (await response.json()) as GitHubRelease;
  const version = release.tag_name || release.name || "";
  if (!version) {
    throw new Error("GitHub Release 缺少版本号");
  }

  const available =
    forceShow || !currentVersion || isNewerVersion(version, currentVersion);

  if (!available) {
    return { available: false };
  }

  return {
    available: true,
    info: {
      source: "github",
      version,
      currentVersion,
      body: release.body || "",
      date: release.published_at,
      url: release.html_url || GITHUB_RELEASES_URL,
      installable: false,
    },
  };
}

export async function checkForAppUpdate(
  options: AppUpdateCheckOptions = {}
): Promise<AppUpdateCheckResult> {
  const currentVersion = await getVersion();
  const forceShow = options.forceShow ?? false;

  try {
    const update = await check({ timeout: options.timeoutMs ?? 15_000 });
    if (update) {
      logger.info("发现可安装更新", {
        currentVersion: update.currentVersion,
        version: update.version,
        date: update.date,
      });

      return {
        available: true,
        info: {
          source: "tauri",
          version: update.version,
          currentVersion: update.currentVersion || currentVersion,
          body: update.body || "",
          date: update.date,
          url: GITHUB_RELEASES_URL,
          installable: true,
        },
        update,
      };
    }

    if (!forceShow) {
      logger.info("Tauri updater 未发现新版本", { currentVersion });
      return { available: false };
    }
  } catch (error) {
    logger.warn("Tauri updater 检查失败，回退到 GitHub Releases", {
      error: getErrorMessage(error),
      currentVersion,
    });
  }

  return checkGitHubRelease(currentVersion, forceShow);
}

export async function downloadAndInstallAppUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void
): Promise<void> {
  await update.downloadAndInstall(onEvent);
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}

