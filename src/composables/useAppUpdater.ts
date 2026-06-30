import { computed, markRaw, ref, shallowRef } from "vue";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import {
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  relaunchApp,
  setStoredUpdateChannel,
  getActiveUpdateChannel,
  type AppUpdateCheckOptions,
  type AppUpdateInfo,
  type UpdateChannel,
} from "@/services/app-updater";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "installing"
  | "relaunching"
  | "failed";

export function useAppUpdater() {
  const status = ref<AppUpdateStatus>("idle");
  const updateInfo = ref<AppUpdateInfo | null>(null);
  const updateResource = shallowRef<Update | null>(null);
  const downloadedBytes = ref(0);
  const contentLength = ref<number | null>(null);
  const lastError = ref<string | null>(null);
  const updateChannel = ref<UpdateChannel>("stable");

  function initChannel(currentVersion: string) {
    updateChannel.value = getActiveUpdateChannel(currentVersion);
  }

  function setChannel(channel: UpdateChannel) {
    updateChannel.value = channel;
    setStoredUpdateChannel(channel);
  }

  const isCheckingUpdate = computed(() => status.value === "checking");
  const isUpdating = computed(
    () =>
      status.value === "downloading" ||
      status.value === "installing" ||
      status.value === "relaunching"
  );
  const canInstallUpdate = computed(
    () =>
      Boolean(updateInfo.value?.installable) && Boolean(updateResource.value)
  );
  const downloadPercent = computed(() => {
    if (!contentLength.value) return 0;
    return Math.min(
      100,
      Math.round((downloadedBytes.value / contentLength.value) * 100)
    );
  });

  function resetDownloadProgress() {
    downloadedBytes.value = 0;
    contentLength.value = null;
  }

  function handleDownloadEvent(event: DownloadEvent) {
    switch (event.event) {
      case "Started":
        downloadedBytes.value = 0;
        contentLength.value = event.data.contentLength ?? null;
        status.value = "downloading";
        break;
      case "Progress":
        downloadedBytes.value += event.data.chunkLength;
        break;
      case "Finished":
        status.value = "installing";
        break;
    }
  }

  async function checkForUpdates(options: AppUpdateCheckOptions = {}) {
    status.value = "checking";
    lastError.value = null;
    resetDownloadProgress();

    const result = await checkForAppUpdate(options);
    if (!result.available || !result.info) {
      updateInfo.value = null;
      updateResource.value = null;
      status.value = "not-available";
      return result;
    }

    updateInfo.value = result.info;
    updateResource.value = result.update ? markRaw(result.update) : null;
    status.value = "available";
    return result;
  }

  async function installUpdate() {
    if (!updateResource.value) {
      throw new Error("当前更新不支持应用内安装");
    }

    try {
      lastError.value = null;
      resetDownloadProgress();
      status.value = "downloading";
      await downloadAndInstallAppUpdate(
        updateResource.value,
        handleDownloadEvent
      );
      status.value = "relaunching";
      await relaunchApp();
    } catch (error) {
      status.value = "failed";
      lastError.value = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  return {
    status,
    updateInfo,
    downloadedBytes,
    contentLength,
    downloadPercent,
    lastError,
    isCheckingUpdate,
    isUpdating,
    canInstallUpdate,
    checkForUpdates,
    installUpdate,
    updateChannel,
    initChannel,
    setChannel,
  };
}
