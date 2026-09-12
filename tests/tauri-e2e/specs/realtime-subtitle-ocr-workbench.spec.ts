import { $, browser } from "@wdio/globals";
import fs from "node:fs";
import path from "node:path";
import { selectNativeFiles } from "../support/native-ui";

type NativePidResult =
  | { status: "pending" }
  | { status: "resolved"; processId: number }
  | { status: "failed"; error: string };

interface NativePidWindow extends Window {
  __AIO_E2E_PID_RESULT__?: NativePidResult;
  __TAURI_INTERNALS__?: {
    invoke<T>(command: string, args: Record<string, never>): Promise<T>;
  };
}

async function navigateTo(targetPath: string): Promise<void> {
  await browser.execute((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, targetPath);
}

async function prepareApplication(): Promise<void> {
  await $("body").waitForExist();
  await browser.pause(2_000);
  await browser.execute(() => {
    const button =
      document.querySelector<HTMLElement>('[data-testid="guided-flow-close"]') ??
      document.querySelector<HTMLElement>('[data-testid="guided-flow-skip"]');
    button?.click();
  });
}

async function getAppProcessId(): Promise<number> {
  await browser.execute(() => {
    const e2eWindow = window as NativePidWindow;
    const tauriInternals = e2eWindow.__TAURI_INTERNALS__;
    e2eWindow.__AIO_E2E_PID_RESULT__ = { status: "pending" };
    if (!tauriInternals) {
      e2eWindow.__AIO_E2E_PID_RESULT__ = {
        status: "failed",
        error: "Tauri IPC internals are unavailable",
      };
      return;
    }
    void tauriInternals
      .invoke<number>("wa_get_self_pid", {})
      .then((processId) => {
        e2eWindow.__AIO_E2E_PID_RESULT__ = { status: "resolved", processId };
      })
      .catch((error: unknown) => {
        e2eWindow.__AIO_E2E_PID_RESULT__ = {
          status: "failed",
          error: String(error),
        };
      });
  });

  await browser.waitUntil(
    async () => {
      const result = await browser.execute(
        () => (window as NativePidWindow).__AIO_E2E_PID_RESULT__
      );
      return result?.status !== "pending";
    },
    { timeout: 5_000, timeoutMsg: "Timed out while resolving the Tauri PID" }
  );
  const result = await browser.execute(
    () => (window as NativePidWindow).__AIO_E2E_PID_RESULT__
  );
  if (
    result?.status !== "resolved" ||
    !Number.isInteger(result.processId) ||
    result.processId <= 0
  ) {
    throw new Error(
      result?.status === "failed"
        ? result.error
        : "Failed to resolve the Tauri process ID"
    );
  }
  return result.processId;
}

function readRoiBoxStyle(): {
  left: string;
  top: string;
  width: string;
  height: string;
} | null {
  const box = document.querySelector<HTMLElement>(
    '[data-testid="rsocr-roi-box"]'
  );
  if (!box) return null;
  return {
    left: box.style.left,
    top: box.style.top,
    width: box.style.width,
    height: box.style.height,
  };
}

function readVideoState(): {
  ready: boolean;
  paused: boolean;
  width: number;
  height: number;
} | null {
  const video = document.querySelector<HTMLVideoElement>(
    '[data-testid="rsocr-video"]'
  );
  if (!video) return null;
  return {
    ready: video.readyState >= 1,
    paused: video.paused,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

function readVideoSettings(): {
  volume: number;
  muted: boolean;
  playbackRate: number;
} | null {
  const video = document.querySelector<HTMLVideoElement>(
    '[data-testid="rsocr-video"]'
  );
  if (!video) return null;
  return {
    volume: video.volume,
    muted: video.muted,
    playbackRate: video.playbackRate,
  };
}

function readZoomText(): string {
  const el = document.querySelector<HTMLElement>(
    '[data-testid="rsocr-zoom-menu"]'
  );
  return el?.textContent?.replace(/\s+/g, "") ?? "";
}

function isMonitorFocused(): boolean {
  const monitor = document.querySelector<HTMLElement>(
    '[data-testid="rsocr-monitor"]'
  );
  return (
    !!monitor &&
    (monitor === document.activeElement || monitor.contains(document.activeElement))
  );
}

/** WebDriver moveTo 在 Tauri WebView 下不触发 hover 菜单，直接派发 mouseenter。 */
async function openHoverMenu(testId: string): Promise<void> {
  await browser.execute((id) => {
    document
      .querySelector(`[data-testid="${id}"]`)
      ?.dispatchEvent(new MouseEvent("mouseenter"));
  }, testId);
}

const mediaPath = process.env.AIO_E2E_RSOCR_MEDIA?.trim();
const nativeDescribe =
  process.env.AIO_E2E_NATIVE_UI === "1" && mediaPath ? describe : describe.skip;

nativeDescribe("Local video OCR workbench with a real media file", () => {
  let appProcessId = 0;

  before(async () => {
    if (!mediaPath || !fs.existsSync(mediaPath)) {
      throw new Error(`AIO_E2E_RSOCR_MEDIA does not exist: ${mediaPath}`);
    }
    await prepareApplication();
    await navigateTo("/realtime-subtitle-ocr");
    await $('[data-testid="rsocr-mode-video"]').waitForDisplayed({
      timeout: 30_000,
    });
    appProcessId = await getAppProcessId();
  });

  it("isolates the video workbench from the screen layout", async () => {
    await $('[data-testid="rsocr-mode-video"]').click();
    await $('[data-testid="rsocr-workbench"]').waitForDisplayed({
      timeout: 20_000,
    });

    await $('[data-testid="rsocr-mode-screen"]').click();
    await $('[data-testid="rsocr-workbench"]').waitForDisplayed({
      reverse: true,
      timeout: 10_000,
    });
    await $(".rsocr-main").waitForDisplayed({ timeout: 10_000 });

    await $('[data-testid="rsocr-mode-video"]').click();
    await $('[data-testid="rsocr-workbench"]').waitForDisplayed({
      timeout: 20_000,
    });
  });

  it("imports a local video and mounts the monitor, ROI and timeline", async () => {
    await $('[data-testid="rsocr-choose"]').click();
    const selection = selectNativeFiles([mediaPath!], appProcessId);
    if (!selection.success) {
      throw new Error(selection.error || "Native file selection failed");
    }

    const fileName = await $('[data-testid="rsocr-file-name"]');
    await fileName.waitForDisplayed({ timeout: 30_000 });
    if (!(await fileName.getText()).includes(path.basename(mediaPath!))) {
      throw new Error(`Unexpected imported file name: ${await fileName.getText()}`);
    }

    await $('[data-testid="rsocr-video"]').waitForDisplayed({
      timeout: 20_000,
    });
    await browser.waitUntil(
      async () => {
        const state = await browser.execute(readVideoState);
        return Boolean(state?.ready && state.width > 0 && state.height > 0);
      },
      { timeout: 30_000, timeoutMsg: "Video metadata did not become ready" }
    );

    await $('[data-testid="rsocr-roi-box"]').waitForDisplayed({
      timeout: 10_000,
    });
    await $('[data-testid="rsocr-timeline"]').waitForDisplayed({
      timeout: 10_000,
    });
    const stageCanvas = await $(
      '[data-testid="rsocr-timeline"] .timeline-editor__stage canvas'
    );
    await stageCanvas.waitForExist({ timeout: 10_000 });
  });

  it("reflects the full-frame ROI preset in the overlay", async () => {
    await $('[data-testid="rsocr-roi-preset-full"]').click();
    await browser.waitUntil(
      async () => {
        const style = await browser.execute(readRoiBoxStyle);
        return (
          style !== null &&
          style.left === "0%" &&
          style.top === "0%" &&
          style.width === "100%" &&
          style.height === "100%"
        );
      },
      { timeout: 10_000, timeoutMsg: "ROI overlay did not apply the full preset" }
    );
  });

  it("toggles the ROI aspect-ratio lock", async () => {
    const lockSwitch = await $('[data-testid="rsocr-roi-lock"]');
    await lockSwitch.waitForDisplayed({ timeout: 10_000 });
    const before = (await lockSwitch.getAttribute("class")) ?? "";
    await lockSwitch.$(".el-switch__core").click();
    await browser.waitUntil(
      async () => {
        const after = (await lockSwitch.getAttribute("class")) ?? "";
        return after.includes("is-checked") !== before.includes("is-checked");
      },
      { timeout: 5_000, timeoutMsg: "ROI aspect lock did not toggle" }
    );
  });

  it("plays and pauses the monitor", async () => {
    const playButton = await $('[data-testid="rsocr-play"]');
    await playButton.click();
    await browser.waitUntil(
      async () => {
        const state = await browser.execute(readVideoState);
        return state !== null && !state.paused;
      },
      { timeout: 10_000, timeoutMsg: "Video did not start playing" }
    );

    await playButton.click();
    await browser.waitUntil(
      async () => {
        const state = await browser.execute(readVideoState);
        return state !== null && state.paused;
      },
      { timeout: 10_000, timeoutMsg: "Video did not pause" }
    );
  });

  it("changes volume from the volume control and toggles mute", async () => {
    const volumeButton = await $('[data-testid="rsocr-volume"]');
    await openHoverMenu("rsocr-volume-menu");
    const slider = await $('[data-testid="rsocr-volume-slider"]');
    await slider.waitForExist({ timeout: 5_000 });

    await browser.execute(() => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="rsocr-volume-slider"]'
      );
      if (!input) return;
      input.value = "0.4";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await browser.waitUntil(
      async () => {
        const settings = await browser.execute(readVideoSettings);
        return (
          settings !== null &&
          Math.abs(settings.volume - 0.4) < 0.02 &&
          settings.muted === false
        );
      },
      { timeout: 5_000, timeoutMsg: "Volume slider did not update the video" }
    );

    await volumeButton.click();
    await browser.waitUntil(
      async () => {
        const settings = await browser.execute(readVideoSettings);
        return settings !== null && settings.muted;
      },
      { timeout: 5_000, timeoutMsg: "Volume button did not mute" }
    );
    await volumeButton.click();
    await browser.waitUntil(
      async () => {
        const settings = await browser.execute(readVideoSettings);
        return settings !== null && !settings.muted;
      },
      { timeout: 5_000, timeoutMsg: "Volume button did not unmute" }
    );
  });

  it("changes playback rate from the rate menu", async () => {
    await openHoverMenu("rsocr-rate-menu");
    const option = await $(
      '//button[contains(@class,"ctrl-popup__item") and normalize-space()="1.5x"]'
    );
    await option.waitForDisplayed({ timeout: 5_000 });
    await option.click();
    await browser.waitUntil(
      async () => {
        const settings = await browser.execute(readVideoSettings);
        return (
          settings !== null && Math.abs(settings.playbackRate - 1.5) < 0.001
        );
      },
      { timeout: 5_000, timeoutMsg: "Rate menu did not update playbackRate" }
    );
  });

  it("toggles fit and 100% on viewport double-click", async () => {
    const fitPercent = await browser.execute(readZoomText);

    await openHoverMenu("rsocr-zoom-menu-wrap");
    const option = await $(
      '//button[contains(@class,"ctrl-popup__item") and normalize-space()="200%"]'
    );
    await option.waitForDisplayed({ timeout: 5_000 });
    await option.click();
    await browser.waitUntil(
      async () => (await browser.execute(readZoomText)).includes("200%"),
      { timeout: 5_000, timeoutMsg: "Zoom ratio menu did not apply 200%" }
    );

    const viewport = await $(".video-monitor__viewport");
    await viewport.doubleClick();
    await browser.waitUntil(
      async () => (await browser.execute(readZoomText)) === fitPercent,
      { timeout: 5_000, timeoutMsg: "Double-click did not return to fit" }
    );

    await viewport.doubleClick();
    await browser.waitUntil(
      async () => (await browser.execute(readZoomText)).includes("100%"),
      { timeout: 5_000, timeoutMsg: "Double-click did not switch to 100%" }
    );
  });

  it("focuses the monitor when the viewport is clicked", async () => {
    await $(".video-monitor__viewport").click();
    await browser.waitUntil(
      async () => await browser.execute(isMonitorFocused),
      { timeout: 5_000, timeoutMsg: "Monitor did not receive keyboard focus" }
    );
  });
});
