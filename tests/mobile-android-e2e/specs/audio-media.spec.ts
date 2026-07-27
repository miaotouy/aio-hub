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

export async function runAudioMediaScenario(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view");
  const selector = `[data-testid="asset-tile"][data-asset-name="${context.fixtures.audio.fileName}"]`;
  let tile = await context.driver.$(selector);
  if (!(await tile.isExisting())) {
    await clickTestElement(context.driver, "asset-import");
    await clickTestElement(context.driver, "asset-import-file");
    await switchToNative(context.driver);
    await chooseDocumentsUiFile(
      context.driver,
      context.fixtures.audio.fileName,
      APP_PACKAGE
    );
    await switchToWebview(context.driver);
    tile = await context.driver.$(selector);
  }
  tile = await waitForImportedAssetTile(
    context.driver,
    context.fixtures.audio.fileName
  );
  if (
    !new Set(["audio/wav", "audio/x-wav"]).has(
      (await tile.getAttribute("data-asset-mime")) ?? ""
    )
  ) {
    throw new Error("Imported audio fixture did not retain a WAV MIME type.");
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
      timeoutMsg: "Managed audio preview did not become ready.",
    }
  );
  const audio = await previewHost.$("audio");
  await audio.waitForExist({ timeout: 5_000 });
  const source = await audio.getAttribute("src");
  if (!source?.startsWith("http://aio-asset.localhost/")) {
    throw new Error("Audio preview did not receive a managed preview URL.");
  }

  const inlinePlayer = await testElement(context.driver, "media-audio-player");
  const playToggle = await testElement(
    context.driver,
    "media-audio-play-toggle"
  );
  await playToggle.click();
  await context.driver.waitUntil(
    async () =>
      (await inlinePlayer.getAttribute("data-playing")) === "true" &&
      Number(await inlinePlayer.getAttribute("data-current-time")) > 0,
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg:
        "Managed audio did not begin playback or advance its progress.",
    }
  );
  const playedSeconds = Number(
    await inlinePlayer.getAttribute("data-current-time")
  );

  await context.driver.execute(() => {
    window.location.hash = "#/";
  });
  await waitForTestElementGone(context.driver, "asset-detail");
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view");
  await testElement(context.driver, "asset-detail");
  const restoredPreviewHost = await testElement(
    context.driver,
    "asset-preview-ready",
    30_000
  );
  await context.driver.waitUntil(
    async () =>
      (await restoredPreviewHost.getAttribute("data-state")) === "ready",
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg:
        "Managed audio preview did not recover after keep-alive route activation.",
    }
  );
  const restoredPlayer = await testElement(
    context.driver,
    "media-audio-player"
  );
  if ((await restoredPlayer.getAttribute("data-playing")) !== "false") {
    throw new Error(
      "Managed audio was still playing after leaving the asset route."
    );
  }

  const restoredPlayToggle = await testElement(
    context.driver,
    "media-audio-play-toggle"
  );
  await restoredPlayToggle.click();
  await context.driver.waitUntil(
    async () =>
      (await restoredPlayer.getAttribute("data-playing")) === "true" &&
      Number(await restoredPlayer.getAttribute("data-current-time")) > 0,
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: "Reactivated managed audio did not begin playback.",
    }
  );
  await restoredPlayToggle.click();
  await context.driver.waitUntil(
    async () => (await restoredPlayer.getAttribute("data-playing")) === "false",
    {
      timeout: 5_000,
      interval: 100,
      timeoutMsg:
        "Managed audio did not pause after the play toggle was pressed.",
    }
  );
  // Android WebView may deliver the final timeupdate after the pause event. Let
  // that event settle, then assert that the paused clock no longer advances.
  await context.driver.pause(500);
  const pausedSeconds = Number(
    await restoredPlayer.getAttribute("data-current-time")
  );
  await context.driver.pause(500);
  const pausedSecondsAfterWait = Number(
    await restoredPlayer.getAttribute("data-current-time")
  );
  if (Math.abs(pausedSecondsAfterWait - pausedSeconds) > 0.05) {
    throw new Error(
      `Managed audio progress advanced after pause: ${JSON.stringify({ playedSeconds, pausedSeconds, pausedSecondsAfterWait })}`
    );
  }

  const expand = await context.driver.$('[aria-label="展开音频播放器"]');
  await expand.waitForClickable({ timeout: 15_000 });
  await expand.click();
  const immersive = await testElement(
    context.driver,
    "media-preview-immersive"
  );
  for (const label of ["后退 10 秒", "前进 10 秒", "调整播放速度", "静音"]) {
    const control = await immersive.$(`[aria-label="${label}"]`);
    await control.waitForDisplayed({ timeout: 15_000 });
  }
  const close = await immersive.$(".immersive-header button");
  await close.click();
  await immersive.waitForExist({ timeout: 10_000, reverse: true });
  return {
    fileName: context.fixtures.audio.fileName,
    sourceKind: "managed-preview",
    playedSeconds,
  };
}
