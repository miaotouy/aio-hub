import { ref, shallowRef, reactive, onBeforeUnmount, watch, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { MpcBeClient } from "../core/mpcBeApi";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { PlayerWindowInfo, ExternalPlayerConfig, OverlayState, MpcBeStatus } from "../types";

const logger = createModuleLogger("danmaku-player/externalPlayer");
const errorHandler = createModuleErrorHandler("danmaku-player/externalPlayer");

const DEFAULT_PLAYER_CONFIG: ExternalPlayerConfig = {
  playerType: "mpc-be",
  webPort: 13579,
  offsetTop: 0,
  offsetBottom: 0,
  fullscreenOffsetTop: 0,
  fullscreenOffsetBottom: 0,
  enableFullscreenBoost: true,
};

const DEFAULT_OVERLAY_STATE: OverlayState = {
  connected: false,
  targetHwnd: null,
  overlayCreated: false,
  playbackState: "Disconnected",
  currentFile: "",
  currentPosition: 0,
  totalDuration: 0,
};

const configManager = createConfigManager<ExternalPlayerConfig>({
  moduleName: "danmaku-external-player",
  createDefault: () => ({ ...DEFAULT_PLAYER_CONFIG }),
});

export function useExternalPlayer() {
  const playerWindows = ref<PlayerWindowInfo[]>([]);
  const playerConfig = reactive<ExternalPlayerConfig>({ ...DEFAULT_PLAYER_CONFIG });
  const overlayState = reactive<OverlayState>({ ...DEFAULT_OVERLAY_STATE });
  const mpcClient = shallowRef<MpcBeClient | null>(null);
  const scanning = ref(false);

  let statusPreviewTimer: ReturnType<typeof setInterval> | null = null;
  let statusPreviewPolling = false;

  onMounted(async () => {
    const saved = await configManager.load();
    Object.assign(playerConfig, saved);
  });

  watch(
    playerConfig,
    (newConfig) => {
      configManager.saveDebounced({ ...newConfig });
      if (mpcClient.value) {
        mpcClient.value.setPort(newConfig.webPort);
      }
    },
    { deep: true },
  );

  /**
   * 扫描播放器窗口。
   * @param className 指定 Win32 类名过滤；不传则列出所有可见顶层窗口，供用户手动选择。
   */
  async function scanPlayerWindows(classNames?: string[]): Promise<PlayerWindowInfo[]> {
    scanning.value = true;

    try {
      const windows = await invoke<PlayerWindowInfo[]>("find_player_windows", {
        classNames: classNames ?? null,
      });

      playerWindows.value = windows;
      logger.info("播放器窗口扫描完成", { count: windows.length, filter: classNames ?? "ALL" });
      return windows;
    } catch (error) {
      errorHandler.error(error, "扫描播放器窗口失败", { classNames });
      playerWindows.value = [];
      return [];
    } finally {
      scanning.value = false;
    }
  }

  function getOrCreateMpcClient(): MpcBeClient {
    if (!mpcClient.value) {
      mpcClient.value = new MpcBeClient(playerConfig.webPort);
    } else {
      mpcClient.value.setPort(playerConfig.webPort);
    }

    return mpcClient.value;
  }

  async function testConnection(): Promise<boolean> {
    try {
      const client = getOrCreateMpcClient();
      const connected = await client.testConnection();

      overlayState.connected = connected;
      if (!connected) {
        overlayState.playbackState = "Disconnected";
      }

      logger.info("MPC-BE Web API 连接测试完成", {
        connected,
        port: playerConfig.webPort,
        lastError: client.lastError,
      });

      return connected;
    } catch (error) {
      overlayState.connected = false;
      overlayState.playbackState = "Disconnected";
      errorHandler.error(error, "MPC-BE Web API 连接测试失败", {
        port: playerConfig.webPort,
      });
      return false;
    }
  }

  function selectPlayerWindow(hwnd: number): void {
    overlayState.targetHwnd = hwnd;
    logger.info("已选择外部播放器窗口", { hwnd });
  }

  function updateStatusPreview(status: MpcBeStatus | null): void {
    if (!status) {
      overlayState.connected = false;
      overlayState.playbackState = "Disconnected";
      return;
    }

    overlayState.connected = true;
    overlayState.playbackState = status.state;
    overlayState.currentFile = status.file;
    overlayState.currentPosition = status.position;
    overlayState.totalDuration = status.duration;
  }

  function startStatusPreview(): void {
    if (statusPreviewTimer !== null) {
      return;
    }

    const pollStatus = async () => {
      if (statusPreviewPolling) {
        return;
      }

      statusPreviewPolling = true;

      try {
        const client = getOrCreateMpcClient();
        const status = await client.getStatus();
        updateStatusPreview(status);
      } catch (error) {
        overlayState.connected = false;
        overlayState.playbackState = "Disconnected";
        errorHandler.handle(error, {
          userMessage: "外部播放器状态预览更新失败",
          showToUser: false,
          context: { port: playerConfig.webPort },
        });
      } finally {
        statusPreviewPolling = false;
      }
    };

    void pollStatus();
    statusPreviewTimer = setInterval(() => {
      void pollStatus();
    }, 1000);

    logger.info("已启动外部播放器状态预览轮询", { intervalMs: 1000 });
  }

  function stopStatusPreview(): void {
    if (statusPreviewTimer === null) {
      return;
    }

    clearInterval(statusPreviewTimer);
    statusPreviewTimer = null;
    statusPreviewPolling = false;
    logger.info("已停止外部播放器状态预览轮询");
  }

  function cleanup(): void {
    stopStatusPreview();
    mpcClient.value = null;
    Object.assign(overlayState, DEFAULT_OVERLAY_STATE);
    logger.debug("外部播放器连接状态已清理");
  }

  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    // 状态
    playerWindows,
    playerConfig,
    overlayState,
    mpcClient,
    scanning,

    // 方法
    scanPlayerWindows,
    testConnection,
    selectPlayerWindow,
    startStatusPreview,
    stopStatusPreview,
    cleanup,
  };
}