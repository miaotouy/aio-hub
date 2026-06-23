import { getVersion } from "@tauri-apps/api/app";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { compareVersions } from "compare-versions";
import { createModuleLogger } from "@/utils/logger";
import { useAppSettingsStore } from "@/stores/appSettingsStore";

const logger = createModuleLogger("AppUpdater");

const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/miaotouy/aio-hub/releases/latest";
const GITHUB_RELEASES_URL = "https://github.com/miaotouy/aio-hub/releases";

export type AppUpdateSource = "tauri" | "github";
export type UpdateChannel = "stable" | "prerelease";

export interface AppUpdateInfo {
  source: AppUpdateSource;
  version: string;
  currentVersion: string;
  body: string;
  date?: string;
  url: string;
  installable: boolean;
}

export function getStoredUpdateChannel(): UpdateChannel | null {
  try {
    const store = useAppSettingsStore();
    const channel = store.settings.updateChannel;
    if (channel === "stable" || channel === "prerelease") {
      return channel;
    }
  } catch {
    // Pinia store 尚未初始化，返回 null
  }
  return null;
}

export function setStoredUpdateChannel(channel: UpdateChannel): void {
  try {
    const store = useAppSettingsStore();
    store.update({ updateChannel: channel });
  } catch {
    // Pinia store 尚未初始化，忽略
  }
}

export function detectDefaultUpdateChannel(version: string): UpdateChannel {
  // 如果版本号包含字母或连字符（如 alpha, beta, rc 等），则默认为 prerelease 通道
  const isPrerelease = /[a-zA-Z]/.test(version) || version.includes("-");
  return isPrerelease ? "prerelease" : "stable";
}

export function getActiveUpdateChannel(currentVersion: string): UpdateChannel {
  const stored = getStoredUpdateChannel();
  if (stored) return stored;
  return detectDefaultUpdateChannel(currentVersion);
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

function isNewerVersion(
  latestVersion: string,
  currentVersion: string
): boolean {
  try {
    return (
      compareVersions(
        normalizeVersion(latestVersion),
        normalizeVersion(currentVersion)
      ) > 0
    );
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
  forceShow: boolean,
  channel: UpdateChannel
): Promise<AppUpdateCheckResult> {
  let release: GitHubRelease & { prerelease?: boolean };

  if (channel === "stable") {
    const response = await fetch(GITHUB_LATEST_RELEASE_API);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    release = (await response.json()) as GitHubRelease;
  } else {
    // beta 通道，获取所有 releases 列表，取第一个
    const response = await fetch(
      "https://api.github.com/repos/miaotouy/aio-hub/releases"
    );
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    const releases = (await response.json()) as Array<
      GitHubRelease & { prerelease?: boolean }
    >;
    if (releases.length === 0) {
      throw new Error("GitHub 没有发布任何版本");
    }
    release = releases[0];
  }

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
  const channel = getActiveUpdateChannel(currentVersion);

  // stable 通道：优先使用 Tauri updater
  if (channel === "stable") {
    try {
      const update = await check({ timeout: options.timeoutMs ?? 15_000 });
      if (update) {
        logger.info("发现可安装更新 (Stable)", {
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

    return checkGitHubRelease(currentVersion, forceShow, "stable");
  } else {
    // prerelease 通道
    try {
      const githubResult = await checkGitHubRelease(
        currentVersion,
        forceShow,
        "prerelease"
      );
      if (!githubResult.available || !githubResult.info) {
        return { available: false };
      }

      // 找到了新版本！
      // 看看这个新版本是不是稳定版。如果是稳定版，且我们能通过 Tauri updater 检查到，那就用 Tauri updater（支持应用内安装）
      const isPrerelease =
        /[a-zA-Z]/.test(githubResult.info.version) ||
        githubResult.info.version.includes("-");

      if (!isPrerelease) {
        try {
          const update = await check({ timeout: options.timeoutMs ?? 10_000 });
          if (update && update.version === githubResult.info.version) {
            logger.info("发现可安装更新 (Beta 通道中的 Stable 版本)", {
              currentVersion: update.currentVersion,
              version: update.version,
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
        } catch (e) {
          logger.warn(
            "Prerelease 通道尝试 Tauri updater 失败，使用 GitHub 结果",
            e
          );
        }
      }

      return githubResult;
    } catch (error) {
      logger.error("Prerelease 通道检查更新失败", error);
      throw error;
    }
  }
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

