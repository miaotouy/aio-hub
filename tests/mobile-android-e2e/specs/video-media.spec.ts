import { switchToNative, switchToWebview } from "../support/appium";
import { chooseDocumentsUiFile } from "../support/android-selectors";
import {
  clickTestElement,
  testElement,
  waitForImportedAssetTile,
  waitForTestElementGone,
} from "../support/webview";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";

async function closeExistingAssetDetail(
  context: ScenarioContext
): Promise<void> {
  const detail = await context.driver.$('[data-testid="asset-detail"]');
  if (!(await detail.isExisting()) || !(await detail.isDisplayed())) return;
  const close = await detail.$('[data-testid="asset-detail-close"]');
  await close.click();
  await waitForTestElementGone(context.driver, "asset-detail");
}

export async function runVideoMediaScenario(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view");
  await closeExistingAssetDetail(context);

  const selector = `[data-testid="asset-tile"][data-asset-name="${context.fixtures.video.fileName}"]`;
  let tile = await context.driver.$(selector);
  if (!(await tile.isExisting())) {
    await clickTestElement(context.driver, "asset-import");
    await clickTestElement(context.driver, "asset-import-file");
    await switchToNative(context.driver);
    await chooseDocumentsUiFile(
      context.driver,
      context.fixtures.video.fileName,
      APP_PACKAGE
    );
    await switchToWebview(context.driver);
    tile = await context.driver.$(selector);
  }
  tile = await waitForImportedAssetTile(
    context.driver,
    context.fixtures.video.fileName
  );
  if ((await tile.getAttribute("data-asset-mime")) !== "video/mp4") {
    throw new Error(
      "Imported video fixture did not retain the video/mp4 MIME type."
    );
  }

  await (await tile.$('[data-testid="asset-open"]')).click();
  await testElement(context.driver, "asset-detail");
  await clickTestElement(context.driver, "asset-detail-preview");
  const previewHost = await testElement(context.driver, "asset-preview-ready");
  await context.driver.waitUntil(
    async () => (await previewHost.getAttribute("data-state")) === "ready",
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: "Managed video preview did not become ready.",
    }
  );
  const video = await testElement(context.driver, "media-video-element");
  const source = await video.getAttribute("src");
  if (!source?.startsWith("http://aio-asset.localhost/")) {
    throw new Error("Video preview did not receive a managed preview URL.");
  }

  const playback = await context.driver.execute(async () => {
    const element = document.querySelector<HTMLVideoElement>(
      '[data-testid="media-video-element"]'
    );
    if (!element) return { error: "video element missing" };
    try {
      // The shared fixture is only three seconds long. Loop it so this E2E
      // scenario verifies playback-state transfer rather than fixture exhaustion.
      element.loop = true;
      await element.play();
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const currentTime = element.currentTime;
      const readyState = element.readyState;
      return { currentTime, paused: element.paused, readyState };
    } catch (cause) {
      return {
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });
  if (
    !playback ||
    "error" in playback ||
    playback.currentTime <= 0 ||
    playback.paused ||
    playback.readyState < 2
  ) {
    throw new Error(
      `Managed video did not decode and begin playback in Android WebView: ${JSON.stringify(playback)}`
    );
  }

  const fallbackInstalled = await context.driver.execute(() => {
    const element = document.querySelector<HTMLVideoElement>(
      '[data-testid="media-video-element"]'
    );
    if (!element) return false;
    Object.defineProperty(element, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new Error("forced WebView fallback")),
    });
    return true;
  });
  if (!fallbackInstalled) {
    throw new Error("Could not install the video Fullscreen API fallback probe.");
  }
  await (await context.driver.$('[aria-label="全屏播放视频"]')).click();
  const immersive = await testElement(
    context.driver,
    "media-preview-immersive"
  );
  const immersivePlayer = await immersive.$(
    '[data-testid="media-video-player"]'
  );
  const immersiveLoopEnabled = await context.driver.execute(() => {
    const element = document.querySelector<HTMLVideoElement>(
      '[data-testid="media-preview-immersive"] [data-testid="media-video-element"]'
    );
    if (!element) return false;
    element.loop = true;
    return true;
  });
  if (!immersiveLoopEnabled) {
    throw new Error("Could not keep the immersive fallback video looped.");
  }
  await context.driver.waitUntil(
    async () =>
      (await immersivePlayer.getAttribute("data-playing")) === "true" &&
      Number(await immersivePlayer.getAttribute("data-current-time")) > 0,
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg:
        "Video fullscreen fallback did not preserve the active playback state.",
    }
  );

  await switchToNative(context.driver);
  await context.driver.back();
  await switchToWebview(context.driver);
  await waitForTestElementGone(context.driver, "media-preview-immersive");
  await testElement(context.driver, "asset-detail");
  const resumedInlinePlayer = await testElement(
    context.driver,
    "media-video-player"
  );
  await context.driver.waitUntil(
    async () =>
      (await resumedInlinePlayer.getAttribute("data-playing")) === "true" &&
      Number(await resumedInlinePlayer.getAttribute("data-current-time")) > 0,
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg:
        "Video playback did not resume inline after system back closed fallback.",
    }
  );
  const paused = await context.driver.execute(async () => {
    const element = document.querySelector<HTMLVideoElement>(
      '[data-testid="media-video-element"]'
    );
    if (!element) return { error: "inline video element missing" };
    element.pause();
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    return { paused: element.paused };
  });
  if (!paused || "error" in paused || !paused.paused) {
    throw new Error(
      `Managed video did not pause after returning inline: ${JSON.stringify(paused)}`
    );
  }

  await clickTestElement(context.driver, "asset-detail-close");
  await context.driver.waitUntil(
    async () =>
      (await context.driver.execute(async (url) => {
        try {
          return (await fetch(url, { cache: "no-store" })).status;
        } catch {
          return 404;
        }
      }, source)) === 404,
    {
      timeout: 10_000,
      interval: 250,
      timeoutMsg:
        "Revoked video preview URL remained accessible after closing.",
    }
  );

  return {
    fileName: context.fixtures.video.fileName,
    sourceKind: "managed-preview",
    playedSeconds: playback.currentTime,
    fullscreenFallback: "app-layer-android-back",
  };
}
