import { ref, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { emit as tauriEmit } from "@tauri-apps/api/event";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ParsedDanmaku, AssScriptInfo, DanmakuConfig, ExternalPlayerConfig, WindowRect } from "../types";

const logger = createModuleLogger("danmaku-player/danmakuOverlay");
const errorHandler = createModuleErrorHandler("danmaku-player/danmakuOverlay");

const DEFAULT_SYNC_INTERVAL = 100;
const ACTIVE_SYNC_INTERVAL = 16;
const ACTIVE_SYNC_DURATION = 1000;
const POSITION_CHANGE_THRESHOLD = 0.5;
const MIN_OVERLAY_SIZE = 1;
const FALLBACK_OVERLAY_LABEL = "danmaku-overlay";

interface LogicalOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useDanmakuOverlay() {
  const overlayLabel = ref<string | null>(null);
  const overlayActive = ref(false);

  let positionSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let positionSyncRunning = false;
  let positionSyncBusy = false;
  let targetHwndForSync: number | null = null;
  let playerConfigForSync: ExternalPlayerConfig | null = null;
  let lastPhysicalRect: WindowRect | null = null;
  let activeUntil = 0;

  async function getOverlayWindow(): Promise<WebviewWindow | null> {
    const label = overlayLabel.value ?? FALLBACK_OVERLAY_LABEL;
    return await WebviewWindow.getByLabel(label);
  }

  function hasRectChanged(current: WindowRect, previous: WindowRect | null): boolean {
    if (!previous) {
      return true;
    }

    return (
      Math.abs(current.x - previous.x) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(current.y - previous.y) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(current.width - previous.width) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(current.height - previous.height) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(current.scaleFactor - previous.scaleFactor) > 0.001 ||
      current.isFullscreen !== previous.isFullscreen
    );
  }

  function toLogicalOverlayRect(rect: WindowRect, config: ExternalPlayerConfig): LogicalOverlayRect {
    const scaleFactor = rect.scaleFactor || 1;
    const logicalX = rect.x / scaleFactor;
    const logicalY = rect.y / scaleFactor;
    const logicalW = rect.width / scaleFactor;
    const logicalH = rect.height / scaleFactor;

    const cropTop = rect.isFullscreen ? config.fullscreenOffsetTop : config.offsetTop;
    const cropBottom = rect.isFullscreen ? config.fullscreenOffsetBottom : config.offsetBottom;

    const finalY = logicalY + cropTop / scaleFactor;
    const finalH = Math.max(MIN_OVERLAY_SIZE, logicalH - (cropTop + cropBottom) / scaleFactor);

    return {
      x: logicalX,
      y: finalY,
      width: Math.max(MIN_OVERLAY_SIZE, logicalW),
      height: finalH,
    };
  }

  async function applyOverlayRect(
    rect: LogicalOverlayRect,
    isFullscreen = false,
    enableBoost = true,
    targetHwnd: number | null = null,
  ): Promise<void> {
    const overlay = await getOverlayWindow();

    if (!overlay) {
      logger.warn("弹幕覆盖窗口实例不存在，跳过位置同步", {
        label: overlayLabel.value ?? FALLBACK_OVERLAY_LABEL,
      });
      return;
    }

    await overlay.setPosition(new LogicalPosition(rect.x, rect.y));
    await overlay.setSize(new LogicalSize(rect.width, rect.height));

    // 维护窗口层级
    if (targetHwnd !== null) {
      const shouldTopmost = isFullscreen && enableBoost;
      try {
        await invoke("set_danmaku_overlay_zorder", {
          targetHwnd,
          topmost: shouldTopmost,
        });
      } catch (error) {
        // 忽略可能的错误
        logger.debug("调整覆盖层 Z-order 失败", error);
      }
    }
  }

  async function createOverlay(targetHwnd: number): Promise<string | null> {
    try {
      const label = await invoke<string>("create_danmaku_overlay_window", { targetHwnd });
      overlayLabel.value = label;
      overlayActive.value = true;

      logger.info("弹幕覆盖窗口创建成功", { targetHwnd, label });
      return label;
    } catch (error) {
      overlayLabel.value = null;
      overlayActive.value = false;
      errorHandler.error(error, "创建弹幕覆盖窗口失败", { targetHwnd });
      return null;
    }
  }

  async function closeOverlay(): Promise<void> {
    stopPositionSync();

    try {
      await tauriEmit("danmaku-overlay:stop");
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "发送弹幕覆盖窗口停止事件失败",
        showToUser: false,
        context: { label: overlayLabel.value },
      });
    }

    try {
      await invoke("close_danmaku_overlay_window");
      logger.info("弹幕覆盖窗口已关闭", { label: overlayLabel.value });
    } catch (error) {
      errorHandler.error(error, "关闭弹幕覆盖窗口失败", { label: overlayLabel.value });
    } finally {
      overlayLabel.value = null;
      overlayActive.value = false;
      lastPhysicalRect = null;
      activeUntil = 0;
    }
  }

  async function initOverlay(
    danmakus: ParsedDanmaku[],
    scriptInfo: AssScriptInfo,
    config: DanmakuConfig,
    port: number,
  ): Promise<void> {
    try {
      await tauriEmit("danmaku-overlay:init", { danmakus, scriptInfo, config, port });
      logger.info("弹幕覆盖窗口初始化事件已发送", {
        danmakuCount: danmakus.length,
        port,
      });
    } catch (error) {
      errorHandler.error(error, "初始化弹幕覆盖窗口渲染失败", {
        danmakuCount: danmakus.length,
        port,
      });
    }
  }

  async function syncConfig(config: DanmakuConfig): Promise<void> {
    try {
      await tauriEmit("danmaku-overlay:config-update", config);
    } catch (error) {
      errorHandler.error(error, "同步弹幕覆盖窗口配置失败");
    }
  }

  async function syncDanmakus(danmakus: ParsedDanmaku[], scriptInfo: AssScriptInfo): Promise<void> {
    try {
      await tauriEmit("danmaku-overlay:danmaku-update", { danmakus, scriptInfo });
      logger.debug("弹幕覆盖窗口数据同步事件已发送", { danmakuCount: danmakus.length });
    } catch (error) {
      errorHandler.error(error, "同步弹幕覆盖窗口数据失败", {
        danmakuCount: danmakus.length,
      });
    }
  }

  function scheduleNextPositionSync(delay: number): void {
    if (!positionSyncRunning) {
      return;
    }

    if (positionSyncTimer !== null) {
      clearTimeout(positionSyncTimer);
    }

    positionSyncTimer = setTimeout(() => {
      positionSyncTimer = null;
      void runPositionSyncOnce();
    }, delay);
  }

  async function runPositionSyncOnce(): Promise<void> {
    if (!positionSyncRunning || positionSyncBusy || targetHwndForSync === null || !playerConfigForSync) {
      if (positionSyncRunning) {
        scheduleNextPositionSync(DEFAULT_SYNC_INTERVAL);
      }
      return;
    }

    positionSyncBusy = true;

    try {
      const valid = await invoke<boolean>("is_window_valid", { hwnd: targetHwndForSync });
      if (!valid) {
        logger.warn("目标播放器窗口已失效，自动关闭弹幕覆盖窗口", { hwnd: targetHwndForSync });
        await closeOverlay();
        return;
      }

      const physicalRect = await invoke<WindowRect>("get_player_window_rect", { hwnd: targetHwndForSync });
      const changed = hasRectChanged(physicalRect, lastPhysicalRect);

      if (changed) {
        activeUntil = Date.now() + ACTIVE_SYNC_DURATION;
        const logicalRect = toLogicalOverlayRect(physicalRect, playerConfigForSync);
        await applyOverlayRect(
          logicalRect,
          physicalRect.isFullscreen,
          playerConfigForSync.enableFullscreenBoost,
          targetHwndForSync,
        );
        lastPhysicalRect = physicalRect;
      }

      const nextDelay = Date.now() < activeUntil ? ACTIVE_SYNC_INTERVAL : DEFAULT_SYNC_INTERVAL;
      scheduleNextPositionSync(nextDelay);
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "弹幕覆盖窗口位置同步失败",
        showToUser: false,
        context: { hwnd: targetHwndForSync },
      });
      scheduleNextPositionSync(DEFAULT_SYNC_INTERVAL);
    } finally {
      positionSyncBusy = false;
    }
  }

  function startPositionSync(targetHwnd: number, playerConfig: ExternalPlayerConfig): void {
    stopPositionSync();

    targetHwndForSync = targetHwnd;
    playerConfigForSync = playerConfig;
    positionSyncRunning = true;
    positionSyncBusy = false;
    lastPhysicalRect = null;
    activeUntil = Date.now() + ACTIVE_SYNC_DURATION;

    logger.info("已启动弹幕覆盖窗口位置同步", {
      targetHwnd,
      intervalMs: DEFAULT_SYNC_INTERVAL,
      activeIntervalMs: ACTIVE_SYNC_INTERVAL,
    });

    void runPositionSyncOnce();
  }

  function stopPositionSync(): void {
    positionSyncRunning = false;
    positionSyncBusy = false;
    targetHwndForSync = null;
    playerConfigForSync = null;

    if (positionSyncTimer !== null) {
      clearTimeout(positionSyncTimer);
      positionSyncTimer = null;
    }

    logger.debug("已停止弹幕覆盖窗口位置同步");
  }

  onBeforeUnmount(() => {
    stopPositionSync();

    if (overlayActive.value) {
      void closeOverlay();
    }
  });

  return {
    overlayLabel,
    overlayActive,
    createOverlay,
    closeOverlay,
    initOverlay,
    syncConfig,
    syncDanmakus,
    startPositionSync,
    stopPositionSync,
  };
}
